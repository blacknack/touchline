// Organic 2D match visualisation. An agent-based "director" that plays out the engine's events
// (shots, corners, free kicks, penalties, fouls, cards, goals…) with natural movement: passing
// sequences, off-ball runs, pressing, shape that bends around the ball and breaks when it should.
//
// Continuity rules: nothing teleports. Every set piece has a lead-in that is played from wherever
// the ball is (a corner comes from a blocked cross, a free kick from a tackle on the fouled player,
// a penalty from a foul inside the box, an offside from a through ball that beats the line), and
// engine events are only "committed" (reported to the UI) at the moment they become visible.
import { MatchEvent, Player, Pos } from '../../engine/types';
import { MatchSim, Side } from '../../engine/match/engine';

export const L = 105, W = 68;
type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Agent {
  id: number; side: Side; pos: Pt; vel: Pt; target: Pt; speed: number;
  slot: number; role: Pos; base: Pt; // base = formation point in team-attacking coordinates
  runUntil: number; runTarget: Pt | null; runSpeed: number;
  jitter: Pt; jitterT: number;
  pace: number; // 0.85..1.15 multiplier from attributes
  label?: string; labelUntil: number;
  celebrating: number;
  down: number; // injured/fouled lying time
}

interface Ball { pos: Pt; vel: Pt; z: number; vz: number; carrier: number | null; target: Pt | null; receiver: number | null; speed: number; inFlight: boolean; lastTouch: Side; dead: boolean; }

type Outcome = 'goal' | 'save' | 'big_save' | 'off' | 'post' | 'blocked';

type PlayBase = { ttl: number; evs?: MatchEvent[]; minute?: string; ext?: number };
type Play = PlayBase & (
  | { kind: 'possession'; side: Side }
  | { kind: 'shot'; side: Side; shooter: number; assister?: number; outcome: Outcome; via: 'open' | 'header' | 'freekick' | 'penalty' | 'rebound'; label: string; phase: 'build' | 'delivered' | 'strike' | 'result' | 'done'; disallowed?: boolean; forced?: boolean }
  | { kind: 'corner'; side: Side; phase: 'buildup' | 'out' | 'setup' | 'deliver' | 'done'; taker: number; flag: Pt; wantId: number | null }
  | { kind: 'foul'; side: Side; phase: 'buildup' | 'approach' | 'down' | 'setup' | 'done'; victim?: number; fouler?: number; result: 'none' | 'freekick' | 'penalty'; direct: boolean; taker: number; minX: number; t: number }
  | { kind: 'offside'; side: Side; phase: 'buildup' | 'through' | 'flag' | 'done'; runner?: number; t: number }
  | { kind: 'card'; side: Side; player?: number; label: string; injury?: boolean }
  | { kind: 'stoppage'; label: string; kickoff?: Side; centre?: boolean; noGoal?: Side; spots?: Map<number, Pt> }
  | { kind: 'shootout'; side: Side; taker?: number; scored: boolean; phase: 'setup' | 'done' }
);

export interface VizLabel { text: string; kind: 'goal' | 'card' | 'info' | 'save' | 'whistle'; until: number; }

export class MatchViz {
  sim: MatchSim; players: Record<number, Player>;
  agents = new Map<number, Agent>();
  ball: Ball = { pos: { x: L / 2, y: W / 2 }, vel: { x: 0, y: 0 }, z: 0, vz: 0, carrier: null, target: null, receiver: null, speed: 0, inFlight: false, lastTouch: 'H', dead: false };
  queue: Play[] = [];
  cur: Play | null = null;
  time = 0; // football seconds
  possession: Side = 'H';
  holdTimer = 0;
  label: VizLabel | null = null;
  fx: { kind: 'goal' | 'save' | 'post' | 'whistle'; at: Pt; until: number } | null = null;
  pendingRestart: { kind: 'kickoff' | 'goalkick' | 'gkhold' | 'clearance'; side: Side } | null = null;
  /** score as shown on screen (only counts goals that have been played out) */
  score: [number, number] = [0, 0];
  /** minute label of the play currently on screen */
  displayMinute = "0'";
  /** UI hooks: an engine event becomes visible / the on-screen minute changed */
  onEvent: ((e: MatchEvent) => void) | null = null;
  onMinute: ((m: string) => void) | null = null;
  debug: ((msg: string) => void) | null = null;
  private wantThrough: number | null = null;
  /** only this player may pick up the (dead) ball — the kick-off taker fetching it from the net */
  private fetcher: number | null = null;
  private assisterDone = false;
  private shotOutcome: { play: Extract<Play, { kind: 'shot' }>; gk?: Agent } | null = null;

  constructor(sim: MatchSim, players: Record<number, Player>) {
    this.sim = sim; this.players = players;
    this.score = [sim.H.goals, sim.A.goals];
    this.displayMinute = sim.inShootout ? 'PENS' : `${sim.minute}'`;
    this.syncAgents();
    this.setupKickoff(sim.minute >= 45 ? 'A' : 'H', true);
  }

  // ───────────────────────── setup ─────────────────────────
  syncAgents() {
    for (const side of ['H', 'A'] as Side[]) {
      const t = this.sim.team(side);
      for (const o of t.onPitch) {
        if (!this.agents.has(o.id)) {
          const p = this.players[o.id];
          const base = this.baseFor(side, o.slot, o.pos);
          const home = this.toPitch(side, { x: base.x, y: base.y });
          const entering = this.time > 1; // substitute: walks on from the touchline
          const start = entering ? { x: L / 2 + (side === 'H' ? -2 : 2), y: -0.5 } : home;
          const a: Agent = { id: o.id, side, pos: start, vel: { x: 0, y: 0 }, target: home, speed: 3, slot: o.slot, role: o.pos, base, runUntil: 0, runTarget: null, runSpeed: 7.5, jitter: { x: 0, y: 0 }, jitterT: 0, pace: 0.85 + ((p?.attrs.pace ?? 10) + (p?.attrs.acceleration ?? 10)) / 80, labelUntil: 0, celebrating: 0, down: 0 };
          if (entering) { a.runTarget = home; a.runUntil = this.time + 8; a.runSpeed = 5; }
          this.agents.set(o.id, a);
        } else { const a = this.agents.get(o.id)!; a.slot = o.slot; a.role = o.pos; a.base = this.baseFor(side, o.slot, o.pos); }
      }
    }
    for (const id of [...this.agents.keys()]) {
      const on = this.sim.H.onPitch.some((o) => o.id === id) || this.sim.A.onPitch.some((o) => o.id === id);
      if (!on) { this.agents.delete(id); if (this.ball.carrier === id) this.ball.carrier = null; if (this.ball.receiver === id) this.ball.receiver = null; }
    }
  }
  baseFor(side: Side, slot: number, pos: Pos): Pt {
    const s = this.sim.team(side).slots[slot];
    if (!s || pos === 'GK') return { x: 3, y: W / 2 };
    return { x: 9 + (s.y / 100) * 46, y: 5 + (s.x / 100) * 58 };
  }
  toPitch(side: Side, p: Pt): Pt { return side === 'H' ? { x: p.x, y: p.y } : { x: L - p.x, y: W - p.y }; }
  toAtt(side: Side, p: Pt): Pt { return side === 'H' ? { x: p.x, y: p.y } : { x: L - p.x, y: W - p.y }; }
  dir(side: Side) { return side === 'H' ? 1 : -1; }
  goal(side: Side): Pt { return side === 'H' ? { x: L, y: W / 2 } : { x: 0, y: W / 2 }; }
  opp(side: Side): Side { return side === 'H' ? 'A' : 'H'; }
  gk(side: Side): Agent | undefined { for (const a of this.agents.values()) if (a.side === side && a.role === 'GK') return a; return undefined; }
  teamAgents(side: Side): Agent[] { const r: Agent[] = []; for (const a of this.agents.values()) if (a.side === side) r.push(a); return r; }
  agentName(id?: number) { if (id === undefined) return ''; const n = this.players[id]?.name ?? ''; const parts = n.split(' '); return parts.length > 1 ? parts.slice(1).join(' ') : n; }

  private kickoffSpots(side: Side): Map<number, Pt> {
    const m = new Map<number, Pt>();
    for (const a of this.agents.values()) { const b = { ...a.base }; b.x = Math.min(b.x, 46); m.set(a.id, this.toPitch(a.side, b)); }
    const takers = this.teamAgents(side).filter((a) => a.role === 'ST' || a.role === 'AM' || a.role === 'CM').sort((a, b) => a.base.x - b.base.x).reverse();
    if (takers[0]) m.set(takers[0].id, { x: L / 2 - this.dir(side) * 0.8, y: W / 2 });
    if (takers[1]) m.set(takers[1].id, { x: L / 2 - this.dir(side) * 2.5, y: W / 2 + 1.5 });
    return m;
  }
  /** Everybody jogs back for the kick-off during a stoppage; the taker fetches the ball and carries it to the spot. */
  private prepareKickoff(side: Side, secs: number) {
    const spots = this.kickoffSpots(side);
    const centre = { x: L / 2, y: W / 2 };
    const b = this.ball;
    b.inFlight = false; b.vel = { x: 0, y: 0 }; b.z = 0; b.vz = 0; b.receiver = null; b.dead = true;
    let taker: Agent | undefined;
    for (const a of this.agents.values()) { const s = spots.get(a.id)!; a.celebrating = 0; a.down = 0; if (a.side === side && dist(s, centre) < 1.5) taker = a; a.runTarget = s; a.runUntil = this.time + secs + 12; a.runSpeed = clamp(dist(a.pos, s) / Math.max(1, secs - 0.5), 3, 7); }
    if (b.carrier !== null && this.agents.get(b.carrier)?.side !== side) { b.pos = { ...b.pos }; b.carrier = null; }
    if (taker) {
      if (b.carrier !== taker.id) { b.carrier = null; this.fetcher = taker.id; taker.runTarget = { ...b.pos }; taker.runUntil = this.time + secs + 12; taker.runSpeed = 7; }
      else { taker.runTarget = spots.get(taker.id)!; taker.runSpeed = 6; }
    }
    this.possession = side;
  }
  private setupKickoff(side: Side, instant: boolean) {
    this.fetcher = null;
    const spots = this.kickoffSpots(side);
    for (const a of this.agents.values()) {
      const s = spots.get(a.id)!;
      if (instant || dist(a.pos, s) > 2.5) a.pos = { ...s };
      a.target = { ...a.pos }; a.vel = { x: 0, y: 0 }; a.runTarget = null; a.celebrating = 0; a.down = 0;
    }
    this.ball.pos = { x: L / 2, y: W / 2 }; this.ball.vel = { x: 0, y: 0 }; this.ball.z = 0; this.ball.inFlight = false; this.ball.target = null; this.ball.receiver = null; this.ball.dead = false;
    const taker = this.teamAgents(side).filter((a) => a.role === 'ST' || a.role === 'AM' || a.role === 'CM').sort((a, b) => dist(a.pos, this.ball.pos) - dist(b.pos, this.ball.pos))[0];
    if (taker) this.ball.carrier = taker.id;
    this.possession = side;
    this.holdTimer = 0.8;
  }

  // ───────────────────────── queueing engine events ─────────────────────────
  busy() { return this.queue.length > 0 || (this.cur !== null && this.cur.kind !== 'possession'); }

  /** Called once per engine minute with the events it produced. */
  enqueueMinute(events: MatchEvent[], attacking: Side, minuteLabel: string) {
    this.syncAgents();
    const q = <P extends Play>(p: P, ...evs: MatchEvent[]): P => { if (evs.length) p.evs = evs; p.minute = minuteLabel; this.queue.push(p); return p; };
    if (events.length === 0) { q({ kind: 'possession', side: attacking, ttl: rnd(9, 14) }); return; }
    const isShotType = (t: string) => ['goal', 'pen_goal', 'own_goal', 'shot', 'shot_off', 'chance_miss', 'post', 'save', 'big_save', 'shot_blocked'].includes(t);
    const outcomeOf = (t: string): Outcome => (t === 'goal' || t === 'pen_goal' || t === 'own_goal' ? 'goal' : t === 'save' ? 'save' : t === 'big_save' ? 'big_save' : t === 'post' ? 'post' : t === 'shot_blocked' ? 'blocked' : 'off');
    const st = (side: Side) => this.teamAgents(side).find((a) => a.role === 'ST')?.id ?? this.teamAgents(side).find((a) => a.role !== 'GK')?.id ?? 0;
    let i = 0;
    while (i < events.length) {
      const e = events[i];
      const side = e.side ?? attacking;
      const next = events[i + 1];
      const prev = events[i - 1];
      switch (e.type) {
        case 'kickoff': q({ kind: 'stoppage', ttl: 1.5, label: 'Kick-off', kickoff: 'H' }, e); break;
        case 'halftime': q({ kind: 'stoppage', ttl: 3, label: 'Half-time', kickoff: 'A' }, e); break;
        case 'fulltime': case 'shootout_end': q({ kind: 'stoppage', ttl: 2, label: e.type === 'fulltime' ? 'Full-time' : 'It\'s over!' }, e); break;
        case 'et_start': q({ kind: 'stoppage', ttl: 3, label: 'Extra time', kickoff: 'A' }, e); break;
        case 'et_half': q({ kind: 'stoppage', ttl: 3, label: 'Half-time in extra time', kickoff: 'H' }, e); break;
        case 'et_end': case 'shootout_start': q({ kind: 'stoppage', ttl: 2.5, label: 'Penalty shoot-out', centre: true }, e); break;
        case 'added_time': q({ kind: 'possession', side: attacking, ttl: 6 }, e); break;
        case 'corner': {
          const t = this.sim.team(side);
          const taker = t.ckTaker != null && this.agents.has(t.ckTaker) ? t.ckTaker : this.teamAgents(side).find((a) => a.role !== 'GK')?.id ?? 0;
          const top = Math.random() < 0.5;
          const flag = this.toPitch(side, { x: L - 0.5, y: top ? 0.5 : W - 0.5 });
          const wide = this.teamAgents(side).filter((a) => a.role !== 'GK' && a.role !== 'CB').sort((a, b) => Math.abs(this.toAtt(side, a.pos).y - (top ? 8 : W - 8)) - Math.abs(this.toAtt(side, b.pos).y - (top ? 8 : W - 8)))[0];
          q({ kind: 'corner', side, ttl: 20, phase: 'buildup', taker, flag, wantId: wide?.id ?? null }, e);
          if (next && isShotType(next.type) && next.side === side) { q({ kind: 'shot', side, shooter: next.playerId ?? taker, assister: taker, outcome: outcomeOf(next.type), via: 'header', label: next.text, ttl: 10, phase: 'delivered' }, next); i++; }
          break;
        }
        case 'freekick': {
          const t = this.sim.team(side);
          const shotNext = !!(next && isShotType(next.type) && next.side === side);
          const taker = t.fkTaker != null && this.agents.has(t.fkTaker) ? t.fkTaker : e.playerId ?? st(side);
          q({ kind: 'foul', side, ttl: 18, phase: 'buildup', victim: e.playerId, fouler: e.secondaryId, result: 'freekick', direct: shotNext, taker, minX: shotNext ? 66 : 52, t: 0 }, e);
          if (shotNext) { q({ kind: 'shot', side, shooter: next.playerId ?? taker, outcome: outcomeOf(next.type), via: next.playerId === taker || next.playerId === undefined ? 'freekick' : 'header', label: next.text, ttl: 10, phase: 'delivered' }, next); i++; }
          break;
        }
        case 'foul': q({ kind: 'foul', side, ttl: 12, phase: 'buildup', victim: e.playerId, fouler: e.secondaryId, result: 'none', direct: false, taker: e.playerId ?? 0, minX: 0, t: 0 }, e); break;
        case 'penalty_awarded': q({ kind: 'foul', side, ttl: 20, phase: 'buildup', victim: e.playerId, fouler: e.secondaryId, result: 'penalty', direct: true, taker: e.playerId ?? 0, minX: 84, t: 0 }, e); break;
        case 'pen_goal': case 'pen_miss': case 'pen_saved': {
          const taker = e.playerId ?? st(side);
          q({ kind: 'shot', side, shooter: taker, outcome: e.type === 'pen_goal' ? 'goal' : e.type === 'pen_saved' ? 'big_save' : 'off', via: 'penalty', label: e.text, ttl: 8, phase: 'delivered' }, e);
          break;
        }
        case 'var': {
          if (next && next.type === 'var_overturn') {
            q({ kind: 'shot', side, shooter: st(side), assister: this.pickAssister(side, st(side)), outcome: 'goal', via: 'open', label: '', ttl: 14, phase: 'build', disallowed: true });
            q({ kind: 'stoppage', ttl: 3, label: '📺 VAR check…' }, e);
            q({ kind: 'stoppage', ttl: 2.5, label: '📺 NO GOAL — offside', noGoal: side }, next);
            i++;
          } else if (next && next.type === 'goal') {
            q({ kind: 'shot', side, shooter: next.playerId ?? st(side), assister: next.secondaryId, outcome: 'goal', via: 'open', label: next.text, ttl: 14, phase: 'build' }, next);
            q({ kind: 'stoppage', ttl: 3, label: '📺 VAR check… goal stands' }, e);
            i++;
          } else q({ kind: 'stoppage', ttl: 3, label: '📺 VAR check…' }, e);
          break;
        }
        case 'var_overturn': q({ kind: 'stoppage', ttl: 2.5, label: '📺 NO GOAL — offside', noGoal: side }, e); break;
        case 'goal': case 'shot': case 'shot_off': case 'chance_miss': case 'post': case 'save': case 'big_save': case 'shot_blocked': case 'own_goal': {
          const rebound = !!(prev && (prev.type === 'save' || prev.type === 'big_save' || prev.type === 'post' || prev.type === 'pen_saved' || prev.type === 'shot_blocked'));
          const assister = e.type === 'goal' && e.secondaryId !== undefined ? e.secondaryId : (e.type !== 'shot_blocked' && e.type !== 'save' && e.type !== 'big_save' && Math.random() < 0.7 ? this.pickAssister(side, e.playerId) : undefined);
          q({ kind: 'shot', side, shooter: e.playerId ?? st(side), assister, outcome: outcomeOf(e.type), via: rebound ? 'rebound' : 'open', label: e.text, ttl: rebound ? 5 : 14, phase: rebound ? 'delivered' : 'build' }, e);
          break;
        }
        case 'offside': q({ kind: 'offside', side, ttl: 16, phase: 'buildup', runner: e.playerId, t: 0 }, e); break;
        case 'yellow': case 'second_yellow': case 'red': {
          const afterFoul = prev && ['foul', 'freekick', 'penalty_awarded'].includes(prev.type);
          const cardSide = e.side ?? attacking; // side of the carded player
          if (!afterFoul) q({ kind: 'foul', side: this.opp(cardSide), ttl: 12, phase: 'buildup', victim: e.secondaryId, fouler: e.playerId, result: 'none', direct: false, taker: e.secondaryId ?? 0, minX: 0, t: 0 });
          q({ kind: 'card', side: cardSide, ttl: 3, player: e.playerId, label: `${e.type === 'yellow' ? '🟨' : '🟥'} ${this.agentName(e.playerId)}` }, e);
          break;
        }
        case 'injury': q({ kind: 'card', side, ttl: 3.5, player: e.playerId, label: `🩹 ${this.agentName(e.playerId)} is down`, injury: true }, e); break;
        case 'sub': q({ kind: 'stoppage', ttl: 2, label: `🔁 ${this.agentName(e.playerId)} on for ${this.agentName(e.secondaryId)}` }, e); break;
        case 'shootout_goal': case 'shootout_miss': q({ kind: 'shootout', side, ttl: 6, taker: e.playerId, scored: e.type === 'shootout_goal', phase: 'setup' }, e); break;
        case 'commentary': q({ kind: 'possession', side, ttl: rnd(8, 12) }, e); break;
        default: q({ kind: 'possession', side: attacking, ttl: 6 }, e);
      }
      i++;
    }
  }
  pickAssister(side: Side, shooter?: number): number | undefined {
    const cands = this.teamAgents(side).filter((a) => a.id !== shooter && a.role !== 'GK' && ['AM', 'CM', 'LW', 'RW', 'LB', 'RB', 'ST'].includes(a.role));
    return cands.length ? cands[Math.floor(Math.random() * cands.length)].id : undefined;
  }
  setLabel(text: string, kind: VizLabel['kind'], secs: number) { this.label = { text, kind, until: this.time + secs }; }
  /** Report a play's engine events to the UI — called at the moment they become visible. */
  private commit(p: Play) {
    if (!p.evs) return;
    for (const e of p.evs) {
      if ((e.type === 'goal' || e.type === 'pen_goal' || e.type === 'own_goal') && e.side) this.score[e.side === 'H' ? 0 : 1]++;
      if (e.type === 'added_time' || (e.type === 'commentary' && e.text.length < 64)) this.setLabel(e.text, 'info', 3);
      this.onEvent?.(e);
    }
    p.evs = undefined;
  }

  // ───────────────────────── update ─────────────────────────
  update(dt: number) {
    dt = Math.min(dt, 0.25);
    this.time += dt;
    this.syncAgents();
    if (!this.cur) { this.cur = this.queue.shift() ?? { kind: 'possession', side: this.possession, ttl: 8 }; this.beginPlay(this.cur); }
    this.cur.ttl -= dt;
    this.runPlay(this.cur, dt);
    if (this.cur && (this.cur.ttl <= 0 || (this.cur as any).phase === 'done')) { this.endPlay(this.cur); this.cur = null; }
    this.updateBall(dt);
    this.updateAgents(dt);
  }

  private beginPlay(p: Play) {
    if (p.minute && p.minute !== this.displayMinute) { this.displayMinute = p.minute; this.onMinute?.(p.minute); }
    const b = this.ball;
    const live = (side: Side) => { if (this.pendingRestart) this.doRestart(); this.possession = side; this.ensureCarrier(side); };
    switch (p.kind) {
      case 'possession': live(p.side); this.commit(p); break;
      case 'shot':
        if (p.via === 'open' && p.phase === 'build') live(p.side);
        if (p.via === 'penalty') { // ball should already be on the spot after the foul play; fall back gently
          const spot = this.toPitch(p.side, { x: L - 11, y: W / 2 });
          if (dist(b.pos, spot) > 2 && b.carrier === null) this.rollBall(spot, 6); b.dead = true;
          const gk = this.gk(this.opp(p.side)); if (gk) gk.target = this.goal(p.side);
        }
        break;
      case 'corner': live(p.side); break;
      case 'foul': live(p.side); break;
      case 'offside': live(p.side); this.wantThrough = p.runner ?? null; break;
      case 'card': {
        this.commit(p);
        b.inFlight = false; b.vel = { x: 0, y: 0 }; b.dead = true;
        this.setLabel(p.label, p.injury ? 'info' : 'card', p.ttl + 1);
        const a = p.player !== undefined ? this.agents.get(p.player) : undefined;
        if (a) { a.label = p.label; a.labelUntil = this.time + 3; a.target = { ...a.pos }; if (p.injury) { a.down = p.ttl; if (b.carrier === a.id) { b.carrier = null; b.pos = { ...a.pos }; } } }
        break;
      }
      case 'stoppage': {
        this.commit(p);
        if (p.label) this.setLabel(p.label, p.label.startsWith('📺') ? 'info' : 'whistle', p.ttl + 1);
        if (p.kickoff) this.prepareKickoff(p.kickoff, p.ttl);
        else { b.inFlight = false; b.vel = { x: 0, y: 0 }; b.dead = true; }
        if (p.centre) this.arrangeShootout();
        if (p.noGoal) { this.pendingRestart = { kind: 'goalkick', side: this.opp(p.noGoal) }; for (const a of this.agents.values()) a.celebrating = 0; }
        break;
      }
      case 'shootout': { this.arrangeShootout(); const t = p.taker !== undefined ? this.agents.get(p.taker) : undefined; this.ball.pos = { x: L - 11, y: W / 2 }; this.ball.carrier = null; this.ball.inFlight = false; this.ball.vel = { x: 0, y: 0 }; this.ball.dead = true; if (t) { t.target = { x: L - 13, y: W / 2 + 0.5 }; t.runTarget = { x: L - 13, y: W / 2 + 0.5 }; t.runUntil = this.time + 2; t.runSpeed = 3; } break; }
    }
  }

  private endPlay(p: Play) {
    if (p.kind === 'stoppage' && p.kickoff) this.setupKickoff(p.kickoff, false);
    if (p.kind === 'card' || p.kind === 'foul') { for (const a of this.agents.values()) a.down = 0; this.ball.dead = false; }
    if (p.kind === 'offside') this.wantThrough = null;
    if (p.kind === 'shot') { this.assisterDone = false; if (this.shotOutcome) { this.ball.pos = { ...(this.ball.target ?? this.ball.pos) }; this.resolveShotArrival(); } }
    if (p.kind === 'corner' && p.phase !== 'done') { this.commit(p); }
    if (p.kind === 'foul' && p.evs) this.commit(p);
    if (p.kind === 'offside' && p.evs) this.commit(p);
    if (p.kind === 'shot' && p.evs) this.commit(p);
  }

  /** Make sure `side` has (or is fetching) the ball without moving it: the nearest player runs to a loose ball. */
  private ensureCarrier(side: Side) {
    const b = this.ball;
    if (b.carrier !== null || b.inFlight) return;
    b.dead = false;
    const a = this.nearestAgent(b.pos, side, undefined, true);
    if (!a) return;
    if (dist(a.pos, b.pos) < 1.5) this.giveBallTo(a);
    else { a.runTarget = { ...b.pos }; a.runUntil = this.time + 4; a.runSpeed = 6.5; }
  }

  private doRestart() {
    const r = this.pendingRestart; if (!r) return;
    this.pendingRestart = null;
    if (r.kind === 'kickoff') { this.setupKickoff(r.side, false); return; }
    if (r.kind === 'goalkick') {
      const gk = this.gk(r.side);
      const spot = this.toPitch(r.side, { x: 5.5, y: W / 2 + rnd(-8, 8) });
      this.rollBall(spot, 9); this.ball.dead = false;
      if (gk) { gk.runTarget = { ...spot }; gk.runUntil = this.time + 4; gk.runSpeed = 4; }
      this.possession = r.side; return;
    }
    if (r.kind === 'gkhold') { this.possession = r.side; this.ball.dead = false; if (this.ball.carrier === null) { const gk = this.gk(r.side); if (gk) { if (dist(gk.pos, this.ball.pos) < 1.5) this.giveBallTo(gk); else { gk.runTarget = { ...this.ball.pos }; gk.runUntil = this.time + 3; gk.runSpeed = 5; } } } this.holdTimer = 1.2; return; }
    if (r.kind === 'clearance') { this.possession = r.side; this.ball.dead = false; this.ensureCarrier(r.side); this.holdTimer = 0.4; }
  }

  private arrangeShootout() {
    for (const a of this.agents.values()) { a.target = { x: L / 2 + rnd(-8, 8), y: W / 2 + rnd(-6, 6) }; a.runTarget = { ...a.target }; a.runUntil = this.time + 3; a.runSpeed = 3; }
    for (const side of ['H', 'A'] as Side[]) { const gk = this.gk(side); if (gk) { gk.target = { x: L - 1.5, y: W / 2 }; gk.runTarget = { ...gk.target }; gk.runUntil = this.time + 3; gk.runSpeed = 4; } }
  }

  // ───────────────────────── plays ─────────────────────────
  private runPlay(p: Play, dt: number) {
    switch (p.kind) {
      case 'possession': this.freePlay(p.side, dt, null); break;
      case 'shot': this.shotPlay(p, dt); break;
      case 'corner': this.cornerPlay(p, dt); break;
      case 'foul': this.foulPlay(p, dt); break;
      case 'offside': this.offsidePlay(p, dt); break;
      case 'card': break;
      case 'stoppage': this.stoppagePlay(p); break;
      case 'shootout': this.shootoutPlay(p, dt); break;
    }
  }

  /** Kick-offs wait until everyone has jogged back and the ball has been carried to the spot. */
  private stoppagePlay(p: Extract<Play, { kind: 'stoppage' }>) {
    if (!p.kickoff) return;
    const b = this.ball;
    const spots = p.spots ?? (p.spots = this.kickoffSpots(p.kickoff));
    // the taker fetches the ball, then carries it to the centre spot
    if (this.fetcher !== null) {
      const f = this.agents.get(this.fetcher);
      if (!f) this.fetcher = null;
      else if (b.carrier !== f.id) { f.runTarget = { ...b.pos }; f.runUntil = this.time + 2; f.runSpeed = 7; if (dist(f.pos, b.pos) < 1.3) { this.giveBallTo(f); b.dead = true; f.runTarget = spots.get(f.id)!; f.runUntil = this.time + 12; f.runSpeed = 6; } }
      else { f.runTarget = spots.get(f.id)!; f.runUntil = this.time + 12; f.runSpeed = 6; }
    }
    if (p.ttl > 0.3) return;
    let ready = true;
    for (const a of this.agents.values()) { const s = spots.get(a.id); if (s && dist(a.pos, s) > 3) { ready = false; a.runTarget = s; a.runUntil = this.time + 2; a.runSpeed = 7; } }
    if (this.fetcher !== null && b.carrier !== this.fetcher) ready = false;
    if (!ready && (p.ext ?? 0) < 16) { p.ttl += 0.5; p.ext = (p.ext ?? 0) + 0.5; }
  }

  /** Free-flowing possession for `side`; optional objective: get the ball to `wantId` (biases passing). */
  private freePlay(side: Side, dt: number, wantId: number | null, urgency = 0) {
    this.possession = side;
    const b = this.ball;
    if (b.inFlight) return;
    if (b.carrier === null) { this.ensureCarrier(side); return; }
    const carrier = this.agents.get(b.carrier);
    if (!carrier) { b.carrier = null; return; }
    if (carrier.side !== side) { // wrong team has it: hurried ball that the right team wins back
      this.holdTimer -= dt;
      if (this.holdTimer > 0) return;
      this.loseBall(carrier, side); this.holdTimer = 0.6; return;
    }
    this.holdTimer -= dt;
    if (this.holdTimer > 0) return;
    const target = this.choosePass(carrier, wantId, urgency);
    if (target) { this.pass(carrier, target); this.holdTimer = rnd(0.5, 1.6) * (1 - urgency * 0.5); }
    else this.holdTimer = rnd(0.3, 0.8);
  }

  /** Carrier from the wrong team plays a loose ball that a player of `toSide` reaches first. */
  private loseBall(carrier: Agent, toSide: Side) {
    const ahead = { x: carrier.pos.x + this.dir(carrier.side) * rnd(6, 14), y: carrier.pos.y + rnd(-8, 8) };
    const winner = this.nearestAgent(ahead, toSide);
    const raw = winner && dist(winner.pos, ahead) < 12 ? { x: winner.pos.x + winner.vel.x * 0.3, y: winner.pos.y + winner.vel.y * 0.3 } : ahead;
    const to = { x: clamp(raw.x, 1.5, L - 1.5), y: clamp(raw.y, 1.5, W - 1.5) };
    this.kick(carrier, to, clamp(8 + dist(carrier.pos, to) * 0.4, 9, 18), winner?.id ?? null);
  }

  private choosePass(carrier: Agent, wantId: number | null, urgency: number): Agent | null {
    const side = carrier.side;
    const goal = this.goal(side);
    const mates = this.teamAgents(side).filter((a) => a.id !== carrier.id && a.down <= 0);
    const opps = this.teamAgents(this.opp(side));
    const carrierAtt = this.toAtt(side, carrier.pos);
    const pressure = Math.min(...opps.map((o) => dist(o.pos, carrier.pos)));
    // sometimes just dribble if in space
    if (!wantId && pressure > 6 && Math.random() < 0.35 && carrierAtt.x < 80) { carrier.runTarget = { x: carrier.pos.x + this.dir(side) * rnd(6, 12), y: clamp(carrier.pos.y + rnd(-4, 4), 2, W - 2) }; carrier.runUntil = this.time + 1.4; carrier.runSpeed = 6.5; return null; }
    let best: Agent | null = null, bestScore = -1e9;
    const line = this.defensiveLine(this.opp(side));
    for (const m of mates) {
      const d = dist(m.pos, carrier.pos);
      if (d < 3 || d > 45) continue;
      if (m.role === 'GK' && !(pressure < 3 && Math.random() < 0.3)) continue;
      const progress = (dist(carrier.pos, goal) - dist(m.pos, goal)) / 10;
      const nearestOpp = Math.min(...opps.map((o) => dist(o.pos, m.pos)));
      const lane = this.laneBlocked(carrier.pos, m.pos, opps) ? -4 : 0;
      let score = progress * 1.4 + Math.min(nearestOpp, 8) * 0.6 + lane - Math.max(0, d - 28) * 0.15 + rnd(-1.2, 1.2);
      if (m.runTarget && this.time < m.runUntil) score += 2.5; // reward runners
      if (wantId !== null) { if (m.id === wantId) score += 6 + urgency * 20; else if (urgency > 0.6) score -= 3; }
      if (this.wantThrough === m.id) score += 9; // the through ball we are looking for (offside play)
      const mAtt = this.toAtt(side, m.pos);
      if (mAtt.x > carrierAtt.x && mAtt.x > line + 0.5 && mAtt.x < L - 6 && this.wantThrough !== m.id) score -= 5; // offside
      if (score > bestScore) { bestScore = score; best = m; }
    }
    if (!best) return null;
    if (bestScore < 0.2 && wantId === null && Math.random() < 0.5) return null;
    return best;
  }
  private laneBlocked(a: Pt, b: Pt, opps: Agent[]): boolean {
    const dx = b.x - a.x, dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1;
    for (const o of opps) {
      const t = ((o.pos.x - a.x) * dx + (o.pos.y - a.y) * dy) / (len * len);
      if (t < 0.12 || t > 0.9) continue;
      const px = a.x + dx * t, py = a.y + dy * t;
      if (Math.hypot(o.pos.x - px, o.pos.y - py) < 1.6) return true;
    }
    return false;
  }
  /** x (in the attacking team's coords) of the second-last defender of `defSide` */
  private defensiveLine(defSide: Side): number {
    const att = this.opp(defSide);
    const xs = this.teamAgents(defSide).filter((a) => a.role !== 'GK').map((a) => this.toAtt(att, a.pos).x).sort((a, b) => b - a);
    return xs.length >= 2 ? xs[1] : 20;
  }

  /** Kick the ball from `from` to a point; `receiver` (if any) will move to meet it. */
  private kick(from: Agent | null, to: Pt, speed: number, receiver: number | null, arc = 0) {
    const b = this.ball;
    b.carrier = null; b.inFlight = true; b.receiver = receiver; b.target = { ...to }; b.dead = false;
    if (from) b.lastTouch = from.side;
    const dx = to.x - b.pos.x, dy = to.y - b.pos.y, len = Math.hypot(dx, dy) || 1;
    speed = Math.max(speed, Math.sqrt(7.5 * len) * 1.05); // a ground ball must actually reach its target
    b.vel = { x: (dx / len) * speed, y: (dy / len) * speed }; b.speed = speed;
    if (arc > 0) { b.z = 0.1; b.vz = arc; } else { b.z = 0; b.vz = 0; }
    this.holdTimer = 0;
  }
  /** Dead ball rolled to a spot (goal kick, kick-off) — nobody plays it on arrival. */
  private rollBall(to: Pt, speed: number) {
    const b = this.ball;
    b.carrier = null; b.receiver = null; b.inFlight = true; b.target = { ...to }; b.dead = true;
    const dx = to.x - b.pos.x, dy = to.y - b.pos.y, len = Math.hypot(dx, dy) || 1;
    b.vel = { x: (dx / len) * speed, y: (dy / len) * speed }; b.speed = speed; b.z = 0; b.vz = 0;
  }

  private pass(from: Agent, to: Agent) {
    const d = dist(from.pos, to.pos);
    const raw = to.runTarget && this.time < to.runUntil ? { x: to.pos.x + to.vel.x * 0.9, y: to.pos.y + to.vel.y * 0.9 } : { x: to.pos.x + to.vel.x * 0.3, y: to.pos.y + to.vel.y * 0.3 };
    const lead = { x: clamp(raw.x, 1.5, L - 1.5), y: clamp(raw.y, 1.5, W - 1.5) };
    this.kick(from, lead, clamp(9 + d * 0.45, 10, 26), to.id, d > 26 ? 6 + d * 0.12 : 0);
    // give-and-go: the passer breaks forward past his marker to offer the return ball
    const fromAtt = this.toAtt(from.side, from.pos);
    if (from.role !== 'GK' && from.role !== 'CB' && fromAtt.x > 30 && fromAtt.x < 88 && Math.random() < 0.3) {
      from.runTarget = this.toPitch(from.side, { x: clamp(fromAtt.x + rnd(9, 16), 10, L - 4), y: clamp(fromAtt.y + rnd(-6, 6), 3, W - 3) }); from.runUntil = this.time + rnd(1.5, 2.5); from.runSpeed = 7;
    }
  }
  private giveBallTo(a: Agent | undefined) { if (!a) return; const b = this.ball; b.carrier = a.id; b.inFlight = false; b.vel = { x: 0, y: 0 }; b.z = 0; b.vz = 0; b.receiver = null; b.lastTouch = a.side; b.dead = false; this.possession = a.side; }
  private nearestAgent(p: Pt, side?: Side, exclude?: number, includeGK = false): Agent | undefined {
    let best: Agent | undefined, bd = 1e9;
    for (const a of this.agents.values()) { if (side && a.side !== side) continue; if (a.id === exclude) continue; if (a.role === 'GK' && !includeGK) continue; if (a.down > 0) continue; const d = dist(a.pos, p); if (d < bd) { bd = d; best = a; } }
    return best;
  }

  private shotPlay(p: Extract<Play, { kind: 'shot' }>, dt: number) {
    const b = this.ball;
    const shooter = this.agents.get(p.shooter) ?? this.nearestAgent(b.pos, p.side);
    if (!shooter) { p.phase = 'done'; return; }
    const shooterAtt = this.toAtt(p.side, shooter.pos);
    if ((p.phase === 'strike' || p.phase === 'result') && p.ttl < 0.5 && (p.ext ?? 0) < 8) { p.ext = (p.ext ?? 0) + (0.5 - p.ttl); p.ttl = 0.5; }
    if (p.phase === 'build') {
      const urgency = clamp(1 - p.ttl / 10, 0, 1);
      if (!shooter.runTarget || this.time > shooter.runUntil) { shooter.runTarget = this.toPitch(p.side, { x: rnd(84, 94), y: rnd(20, 48) }); shooter.runUntil = this.time + 3; shooter.runSpeed = 7; }
      const want = p.assister !== undefined && this.agents.has(p.assister) && b.carrier !== p.assister && !this.assisterDone ? p.assister : p.shooter;
      if (b.carrier === p.assister) this.assisterDone = true;
      this.freePlay(p.side, dt, want, urgency);
      if (b.carrier === p.shooter && (shooterAtt.x > 72 || (p.ttl < 3 && shooterAtt.x > 55))) { p.phase = 'strike'; this.holdTimer = 0.35; return; }
      if (p.ttl < 3 && (p.ext ?? 0) < 10) { p.ttl += 4; p.ext = (p.ext ?? 0) + 4; }
      // running out of time: whoever has it plays it straight to the shooter (once), then we wait for it
      if (p.ttl < 2 && !p.forced && !b.inFlight && b.carrier !== null && b.carrier !== p.shooter) { const c = this.agents.get(b.carrier)!; if (c.side === p.side) { this.pass(c, shooter); p.forced = true; p.ttl += 3.5; } }
      if (p.ttl < -2.5 && b.carrier !== p.shooter) { this.giveBallTo(shooter); p.phase = 'strike'; this.holdTimer = 0.2; }
      return;
    }
    if (p.phase === 'delivered') {
      if (b.inFlight && !b.dead) { b.receiver = shooter.id; shooter.runTarget = { ...(b.target ?? b.pos) }; shooter.runUntil = this.time + 2; shooter.runSpeed = 7.5; return; }
      if (b.carrier !== shooter.id) {
        shooter.runTarget = { ...b.pos }; shooter.runUntil = this.time + 2; shooter.runSpeed = p.via === 'penalty' ? 3 : 7.5;
        if (dist(shooter.pos, b.pos) < (b.carrier !== null ? 2.7 : 1.5)) this.giveBallTo(shooter); // wins it / steals it
        else if (p.ttl < 1.5 && (p.ext ?? 0) < 6) { p.ttl += 3; p.ext = (p.ext ?? 0) + 3; }
        else if (p.ttl < 1.5) { const c = b.carrier !== null ? this.agents.get(b.carrier) : undefined; if (c && c.side === p.side) { p.shooter = c.id; p.phase = 'strike'; this.holdTimer = 0.25; } else { this.debug?.(`delivered snap: via=${p.via} carrier=${b.carrier} carrierSide=${b.carrier !== null ? this.agents.get(b.carrier)?.side : '-'} side=${p.side} d=${dist(shooter.pos, b.pos).toFixed(1)} dead=${b.dead}`); shooter.pos = { ...b.pos }; this.giveBallTo(shooter); } }
        return;
      }
      p.phase = 'strike'; this.holdTimer = p.via === 'penalty' ? 1.4 : p.via === 'freekick' ? 1.2 : 0.25;
      return;
    }
    if (p.phase === 'strike') {
      this.holdTimer -= dt;
      if (this.holdTimer > 0) return;
      this.strike(p, shooter);
      p.phase = 'result';
      return;
    }
    if (p.phase === 'result') { if (b.inFlight) return; p.phase = 'done'; }
  }

  private strike(p: Extract<Play, { kind: 'shot' }>, shooter: Agent) {
    const b = this.ball;
    const side = p.side; const goal = this.goal(side); const d = this.dir(side);
    let to: Pt; let speed = 24; let arc = 0;
    const gk = this.gk(this.opp(side));
    switch (p.outcome) {
      case 'goal': to = { x: goal.x + d * 1.8, y: goal.y + rnd(-3, 3) }; break;
      case 'save': case 'big_save': to = { x: goal.x - d * 0.6, y: goal.y + rnd(-3.2, 3.2) }; break;
      case 'post': to = { x: goal.x, y: goal.y + (Math.random() < 0.5 ? -3.66 : 3.66) }; break;
      case 'blocked': { const blk = this.nearestAgent(shooter.pos, this.opp(side)); to = blk ? { x: blk.pos.x, y: blk.pos.y } : { x: shooter.pos.x + d * 3, y: shooter.pos.y }; speed = 18; break; }
      default: to = { x: goal.x + d * 2.5, y: goal.y + (Math.random() < 0.5 ? -rnd(5, 9) : rnd(5, 9)) }; if (Math.random() < 0.4) arc = 5;
    }
    if (p.via === 'header') { speed = 15; arc = 2.5; }
    if (p.via === 'freekick') { speed = 22; arc = 4; }
    // never shoot from behind the goal line (a chaser can end up there)
    if (this.toAtt(side, shooter.pos).x > L - 1) { shooter.pos = this.toPitch(side, { x: L - 1.5, y: this.toAtt(side, shooter.pos).y }); b.pos = { ...shooter.pos }; }
    speed = Math.max(speed, dist(b.pos, to) / 2.2);
    this.kick(shooter, to, speed, null, arc); b.z = 0.2;
    this.shotOutcome = { play: p, gk };
    if (p.outcome !== 'goal') this.setLabel(`${this.agentName(shooter.id)} shoots…`, 'info', 1.2);
    if (gk) { gk.target = { x: to.x, y: clamp(to.y, W / 2 - 3.5, W / 2 + 3.5) }; }
  }

  private resolveShotArrival() {
    const so = this.shotOutcome; if (!so) return;
    this.shotOutcome = null;
    const p = so.play; const b = this.ball; const side = p.side;
    const shooter = this.agents.get(p.shooter);
    b.inFlight = false; b.vel = { x: 0, y: 0 }; b.z = 0; b.receiver = null;
    switch (p.outcome) {
      case 'goal': {
        if (p.disallowed) {
          this.setLabel(`⚽ ${this.agentName(p.shooter)} scores… VAR is looking`, 'info', 3);
          this.fx = { kind: 'goal', at: { ...b.pos }, until: this.time + 1.5 };
          if (shooter) { shooter.celebrating = 2; shooter.runTarget = this.toPitch(side, { x: 94, y: rnd(10, 58) }); shooter.runUntil = this.time + 2; shooter.runSpeed = 6; }
          b.dead = true;
          break;
        }
        this.commit(p);
        this.setLabel(`⚽ GOAL! ${this.agentName(p.shooter)}${p.assister !== undefined && p.via !== 'penalty' && p.via !== 'freekick' ? ` (${this.agentName(p.assister)})` : ''}`, 'goal', 4);
        this.fx = { kind: 'goal', at: { ...b.pos }, until: this.time + 2.5 };
        b.dead = true;
        if (shooter) { shooter.celebrating = 3; shooter.runTarget = this.toPitch(side, { x: 96, y: Math.random() < 0.5 ? 6 : W - 6 }); shooter.runUntil = this.time + 3; shooter.runSpeed = 6; }
        for (const a of this.teamAgents(side)) if (a.id !== p.shooter && Math.random() < 0.6 && a.role !== 'GK') { a.runTarget = shooter ? { ...shooter.runTarget! } : null; a.runUntil = this.time + 3; a.celebrating = 3; a.runSpeed = 6; }
        this.queue.unshift({ kind: 'stoppage', ttl: 4, label: '', kickoff: this.opp(side) });
        break;
      }
      case 'save': case 'big_save': {
        this.commit(p);
        const gk = so.gk;
        this.setLabel(`🧤 ${p.outcome === 'big_save' ? 'Great save' : 'Saved'} by ${this.agentName(gk?.id)}`, 'save', 2.5);
        this.fx = { kind: 'save', at: { ...b.pos }, until: this.time + 1.2 };
        const next = this.queue[0];
        if (next && next.kind === 'shot' && next.via === 'rebound') { // parried into the danger zone — the rebound play follows
          const spill = this.toPitch(side, { x: L - rnd(4, 9), y: W / 2 + rnd(-7, 7) });
          this.kick(null, spill, 8, null); b.z = 0.3;
          break;
        }
        b.dead = true;
        if (gk) { if (dist(gk.pos, b.pos) < 2.5) { this.giveBallTo(gk); b.dead = true; this.holdTimer = 1.6; } else { gk.runTarget = { ...b.pos }; gk.runUntil = this.time + 3; gk.runSpeed = 5; } }
        this.pendingRestart = { kind: 'gkhold', side: this.opp(side) };
        break;
      }
      case 'post': {
        this.commit(p);
        this.setLabel(`🪵 Off the post! ${this.agentName(p.shooter)}`, 'info', 2.5);
        this.fx = { kind: 'post', at: { ...b.pos }, until: this.time + 1 };
        const out = this.toPitch(side, { x: rnd(86, 95), y: rnd(16, 52) });
        this.kick(null, out, 12, null);
        this.pendingRestart = { kind: 'clearance', side: this.opp(side) };
        break;
      }
      case 'blocked': {
        this.commit(p);
        this.setLabel(`🛡 Blocked!`, 'info', 1.5);
        const loose = this.toPitch(side, { x: this.toAtt(side, b.pos).x - rnd(2, 8), y: this.toAtt(side, b.pos).y + rnd(-6, 6) });
        this.kick(null, loose, 9, null);
        this.pendingRestart = { kind: 'clearance', side: Math.random() < 0.5 ? side : this.opp(side) };
        break;
      }
      default: {
        this.commit(p);
        this.setLabel(p.via === 'penalty' ? `❌ ${this.agentName(p.shooter)} misses!` : `↗ ${this.agentName(p.shooter)} — wide`, 'info', 2.2);
        b.dead = true;
        this.pendingRestart = { kind: 'goalkick', side: this.opp(side) };
        this.queue.unshift({ kind: 'stoppage', ttl: 1.6, label: '' });
      }
    }
  }

  private cornerPlay(p: Extract<Play, { kind: 'corner' }>, dt: number) {
    const b = this.ball;
    const taker = this.agents.get(p.taker);
    const flagAtt = this.toAtt(p.side, p.flag);
    if (p.phase === 'buildup') {
      // work the ball to the wide man on the flag side; his cross / cut-back gets blocked behind
      const urgency = clamp((16 - p.ttl) / 6, 0, 1);
      this.freePlay(p.side, dt, p.wantId, urgency);
      const c = b.carrier !== null ? this.agents.get(b.carrier) : undefined;
      if (c && c.side === p.side && !b.inFlight) {
        const cAtt = this.toAtt(p.side, c.pos);
        if (cAtt.x < 60 && (!c.runTarget || this.time > c.runUntil)) { c.runTarget = this.toPitch(p.side, { x: clamp(cAtt.x + 12, 0, 80), y: clamp(lerp(cAtt.y, flagAtt.y, 0.4), 4, W - 4) }); c.runUntil = this.time + 1.5; c.runSpeed = 6.5; }
        if (cAtt.x > 64 || (p.ttl < 9 && (p.ext ?? 0) >= 8)) {
          const out = this.toPitch(p.side, { x: L + 1, y: flagAtt.y < W / 2 ? rnd(0.5, 2.5) : rnd(W - 2.5, W - 0.5) });
          this.kick(c, out, 13, null); b.dead = true;
          const blocker = this.nearestAgent(c.pos, this.opp(p.side));
          if (blocker) { blocker.runTarget = { x: c.pos.x + this.dir(p.side) * 1.5, y: c.pos.y }; blocker.runUntil = this.time + 0.8; blocker.runSpeed = 7; }
          p.phase = 'out';
        }
      }
      if (p.ttl < 9 && p.phase === 'buildup' && (p.ext ?? 0) < 8) { p.ttl += 4; p.ext = (p.ext ?? 0) + 4; }
      return;
    }
    if (p.phase === 'out') {
      if (!p.ext && b.inFlight && this.toAtt(p.side, b.pos).x < L) return; // still travelling towards the byline
      if (!p.ext && dist(b.pos, p.flag) > 3) { this.rollBall(p.flag, 8); p.ext = 1; p.ttl = Math.max(p.ttl, 4); return; } // ball boy rolls it to the flag
      if (p.ext && b.inFlight && dist(b.pos, p.flag) > 1.2) return;
      {
        b.inFlight = false; b.vel = { x: 0, y: 0 }; b.pos = { ...p.flag }; b.dead = true; b.carrier = null;
        // the designated taker walks over unless he is miles away — then the nearest wide man takes it
        const tk = this.agents.get(p.taker);
        if (!tk || dist(tk.pos, p.flag) > 35) { const alt = this.teamAgents(p.side).filter((a) => a.role !== 'GK' && a.role !== 'CB' && a.role !== 'ST').sort((a, c) => dist(a.pos, p.flag) - dist(c.pos, p.flag))[0]; if (alt) p.taker = alt.id; }
        this.commit(p);
        this.setLabel('Corner', 'whistle', 2); this.fx = { kind: 'whistle', at: { ...p.flag }, until: this.time + 0.8 };
        p.phase = 'setup'; p.ttl = 12;
        const taker2 = this.agents.get(p.taker);
        if (taker2) { taker2.runTarget = { ...p.flag }; taker2.runUntil = this.time + 8; taker2.runSpeed = 6.5; }
        for (const a of this.teamAgents(p.side)) if (a.id !== p.taker && a.role !== 'GK' && ['CB', 'ST', 'AM', 'CM', 'DM', 'LW', 'RW'].includes(a.role)) { a.runTarget = this.toPitch(p.side, { x: rnd(86, 98), y: rnd(20, 48) }); a.runUntil = this.time + 8; a.runSpeed = 5; }
        for (const a of this.teamAgents(this.opp(p.side))) if (a.role !== 'GK' && a.role !== 'ST') { a.runTarget = this.toPitch(p.side, { x: rnd(91, 102), y: rnd(20, 48) }); a.runUntil = this.time + 8; a.runSpeed = 5; }
      }
      return;
    }
    if (p.phase === 'setup') {
      if (taker && dist(taker.pos, p.flag) > 1.5 && p.ttl > 3) return; // wait for the taker to get there
      const to = this.toPitch(p.side, { x: rnd(95, 102), y: rnd(26, 42) });
      this.kick(taker ?? null, to, 16, null, 9); b.z = 0.3;
      for (const a of this.agents.values()) if (a.runTarget && this.time < a.runUntil && a.id !== p.taker) { a.runUntil = this.time + 0.3; }
      p.phase = 'deliver'; p.ttl = 3.5;
      return;
    }
    if (p.phase === 'deliver') {
      const next = this.queue[0];
      if (next && next.kind === 'shot') { p.phase = 'done'; return; } // the shot play takes over the flight
      if (!b.inFlight) { // cleared by a defender
        const clearer = this.nearestAgent(b.pos, this.opp(p.side));
        if (clearer && dist(clearer.pos, b.pos) < 3) { this.giveBallTo(clearer); const out = this.toPitch(this.opp(p.side), { x: rnd(40, 60), y: rnd(10, 58) }); this.kick(clearer, out, 18, null, 8); this.setLabel('Cleared', 'info', 1.2); this.pendingRestart = { kind: 'clearance', side: Math.random() < 0.6 ? this.opp(p.side) : p.side }; }
        p.phase = 'done';
      }
    }
  }

  private foulPlay(p: Extract<Play, { kind: 'foul' }>, dt: number) {
    const b = this.ball;
    const v = p.victim !== undefined ? this.agents.get(p.victim) : undefined;
    const f = p.fouler !== undefined ? this.agents.get(p.fouler) : this.nearestAgent(b.pos, this.opp(p.side));
    if (p.phase === 'buildup') {
      const urgency = clamp((p.ttl < 10 ? 10 - p.ttl : 0) / 5, 0, 1);
      this.freePlay(p.side, dt, v?.id ?? null, urgency);
      const c = b.carrier !== null ? this.agents.get(b.carrier) : undefined;
      if (v && (!v.runTarget || this.time > v.runUntil) && p.result !== 'none') {
        const vAtt = this.toAtt(p.side, v.pos);
        const goalX = p.result === 'penalty' ? rnd(86, 93) : rnd(68, 80);
        if (vAtt.x < goalX - 4 || (p.result === 'penalty' && Math.abs(vAtt.y - W / 2) > 16)) { v.runTarget = this.toPitch(p.side, { x: goalX, y: p.result === 'penalty' ? clamp(vAtt.y * 0.5 + W / 4, 22, 46) : clamp(vAtt.y + rnd(-6, 6), 8, W - 8) }); v.runUntil = this.time + 2; v.runSpeed = 6.5; }
      }
      if (c && c.side === p.side && !b.inFlight) {
        const cAtt = this.toAtt(p.side, c.pos);
        const ready = (c.id === p.victim || p.ttl < 7) && (cAtt.x >= p.minX || p.ttl < 5) && (p.result !== 'penalty' || (cAtt.x > 84 && Math.abs(cAtt.y - W / 2) < 19) || p.ttl < 4);
        if (ready) { if (c.id !== p.victim) p.victim = c.id; p.phase = 'approach'; p.t = 0; this.holdTimer = 3; c.runTarget = { x: c.pos.x + this.dir(p.side) * 5, y: c.pos.y }; c.runUntil = this.time + 2; c.runSpeed = 5; }
      }
      if (p.ttl < 5.5 && p.phase === 'buildup' && (p.ext ?? 0) < 8) { p.ttl += 4; p.ext = (p.ext ?? 0) + 4; }
      return;
    }
    const victim = p.victim !== undefined ? this.agents.get(p.victim) : undefined;
    if (p.phase === 'approach') {
      p.t += dt; this.holdTimer = 3; // victim keeps the ball, fouler closes him down
      if (f && victim) { f.runTarget = { x: victim.pos.x + victim.vel.x * 0.3, y: victim.pos.y + victim.vel.y * 0.3 }; f.runUntil = this.time + 1; f.runSpeed = 8.5; }
      if (victim && (!victim.runTarget || this.time > victim.runUntil)) { victim.runTarget = { x: victim.pos.x + this.dir(p.side) * 5, y: victim.pos.y }; victim.runUntil = this.time + 1.5; victim.runSpeed = 5; }
      if ((f && victim && dist(f.pos, victim.pos) < 1.4) || p.t > 2.5) {
        p.phase = 'down'; p.t = 0;
        if (victim) { victim.down = 2.5; victim.runTarget = null; }
        if (f) { f.runTarget = null; f.target = { ...f.pos }; }
        b.carrier = null; b.vel = { x: 0, y: 0 }; b.inFlight = false; b.dead = true; b.z = 0;
        if (p.result === 'penalty') b.pos = { ...b.pos };
        this.fx = { kind: 'whistle', at: { ...b.pos }, until: this.time + 0.8 };
        this.commit(p);
        this.setLabel(p.result === 'penalty' ? '⚠️ PENALTY!' : `✋ Foul${f ? ' by ' + this.agentName(f.id) : ''}${p.result === 'freekick' ? ' — free kick' : ''}`, 'whistle', 2.5);
        for (const a of this.agents.values()) if (a.runTarget && a.id !== victim?.id) a.runUntil = this.time;
      }
      return;
    }
    if (p.phase === 'down') {
      p.t += dt;
      if (p.t < 1.8) return;
      if (victim) victim.down = 0;
      if (p.result === 'none') { const taker = this.nearestAgent(b.pos, p.side, undefined, false); if (taker) { taker.runTarget = { ...b.pos }; taker.runUntil = this.time + 2; taker.runSpeed = 4; } b.dead = false; this.holdTimer = 0.8; p.phase = 'done'; return; }
      b.dead = true;
      p.phase = 'setup'; p.t = 0; p.ttl = Math.max(p.ttl, 9);
      let taker = this.agents.get(p.taker) ?? victim;
      if (!taker || dist(taker.pos, b.pos) > 32) { taker = victim && victim.down <= 0 ? victim : this.nearestAgent(b.pos, p.side); if (taker) p.taker = taker.id; }
      if (taker) { taker.runTarget = { x: b.pos.x - this.dir(p.side) * 1.2, y: b.pos.y }; taker.runUntil = this.time + 8; taker.runSpeed = 5.5; }
      if (p.result === 'penalty') {
        for (const a of this.agents.values()) {
          if (a.id === taker?.id) continue;
          if (a.role === 'GK') { const g = a.side === this.opp(p.side) ? this.goal(p.side) : this.toPitch(a.side, { x: 4, y: W / 2 }); a.runTarget = g; a.runUntil = this.time + 6; a.runSpeed = 4; continue; }
          a.runTarget = this.toPitch(p.side, { x: rnd(80, 87), y: rnd(8, 60) }); a.runUntil = this.time + 6; a.runSpeed = 4;
        }
        return;
      }
      // free kick: wall lines up, box fills while the taker walks over
      const wallX = b.pos.x + this.dir(p.side) * 9.15;
      const defs = this.teamAgents(this.opp(p.side)).filter((a) => a.role !== 'GK').sort((a, c) => dist(a.pos, b.pos) - dist(c.pos, b.pos)).slice(0, 4);
      defs.forEach((a, i) => { a.runTarget = { x: wallX, y: clamp(b.pos.y + (i - 1.5) * 1.1 + (b.pos.y < W / 2 ? 1 : -1) * 2, 1, W - 1) }; a.runUntil = this.time + 5; a.runSpeed = 5; });
      if (!p.direct) for (const a of this.teamAgents(p.side)) if (a.id !== taker?.id && ['CB', 'ST', 'AM'].includes(a.role)) { a.runTarget = this.toPitch(p.side, { x: rnd(86, 96), y: rnd(20, 48) }); a.runUntil = this.time + 5; a.runSpeed = 4.5; }
      return;
    }
    if (p.phase === 'setup') {
      p.t += dt;
      const taker = this.agents.get(p.taker) ?? victim;
      if (!taker) { p.phase = 'done'; b.dead = false; return; }
      // the taker walks to the ball and picks it up; only after 10 s do we give up and snap him there
      if (b.carrier !== taker.id) {
        if (dist(taker.pos, b.pos) < 1.4 || p.t > 10) { if (dist(taker.pos, b.pos) >= 1.4) taker.pos = { x: b.pos.x - this.dir(p.side) * 0.8, y: b.pos.y }; this.giveBallTo(taker); b.dead = true; p.t = 0; if (p.result === 'penalty') { const spot = this.toPitch(p.side, { x: L - 11, y: W / 2 }); taker.runTarget = { ...spot }; taker.runUntil = this.time + 8; taker.runSpeed = 3; } else { taker.runTarget = null; taker.target = { ...taker.pos }; } }
        else { taker.runTarget = { x: b.pos.x - this.dir(p.side) * 1.2, y: b.pos.y }; taker.runUntil = this.time + 2; taker.runSpeed = 5.5; }
        return;
      }
      if (p.result === 'penalty') {
        const spot = this.toPitch(p.side, { x: L - 11, y: W / 2 });
        if (dist(taker.pos, spot) < 1.3 || p.t > 8) { b.carrier = null; b.pos = { ...spot }; b.vel = { x: 0, y: 0 }; b.dead = true; taker.runTarget = { x: spot.x - this.dir(p.side) * 4, y: spot.y + 1 }; taker.runUntil = this.time + 2; taker.runSpeed = 2.5; p.phase = 'done'; }
        else { taker.runTarget = { ...spot }; taker.runUntil = this.time + 2; taker.runSpeed = 3; }
        return;
      }
      if (p.t > 1.6) {
        b.dead = false;
        if (!p.direct) { const mate = this.choosePass(taker, null, 0); if (mate) this.pass(taker, mate); }
        this.holdTimer = 0.4;
        p.phase = 'done';
      }
    }
  }

  private offsidePlay(p: Extract<Play, { kind: 'offside' }>, dt: number) {
    const b = this.ball;
    const runner = p.runner !== undefined ? this.agents.get(p.runner) : undefined;
    if (!runner) { p.phase = 'done'; return; }
    if (p.phase === 'buildup') {
      p.t += dt;
      this.freePlay(p.side, dt, null, 0);
      const line = this.defensiveLine(this.opp(p.side));
      const rAtt = this.toAtt(p.side, runner.pos);
      // the forward keeps drifting onto the shoulder of the last defender, then goes early
      if (!runner.runTarget || this.time > runner.runUntil) { runner.runTarget = this.toPitch(p.side, { x: clamp(line + rnd(1, 4), 40, 92), y: clamp(rAtt.y + rnd(-5, 5), 8, W - 8) }); runner.runUntil = this.time + 1.5; runner.runSpeed = 5.5; }
      const c = b.carrier !== null ? this.agents.get(b.carrier) : undefined;
      if (c && c.side === p.side && c.id !== runner.id && !b.inFlight && (p.t > 4 || p.ttl < 6)) {
        const cAtt = this.toAtt(p.side, c.pos);
        if (cAtt.x > 35 || p.ttl < 5) {
          const to = this.toPitch(p.side, { x: clamp(Math.max(line, rAtt.x) + rnd(8, 14), 50, 100), y: clamp(rAtt.y + rnd(-3, 3), 4, W - 4) });
          runner.runTarget = { ...to }; runner.runUntil = this.time + 3; runner.runSpeed = 8;
          this.kick(c, to, clamp(12 + dist(c.pos, to) * 0.4, 14, 24), runner.id, dist(c.pos, to) > 25 ? 7 : 0);
          b.dead = true;
          p.phase = 'through';
        }
      }
      return;
    }
    if (p.phase === 'through') {
      if (b.inFlight) { runner.runTarget = { ...(b.target ?? b.pos) }; runner.runUntil = this.time + 2; runner.runSpeed = 8; return; }
      p.phase = 'flag'; p.t = 0;
      runner.runTarget = null; runner.target = { ...runner.pos };
      b.vel = { x: 0, y: 0 }; b.carrier = null; b.dead = true;
      this.commit(p);
      this.setLabel(`🚩 Offside, ${this.agentName(runner.id)}`, 'whistle', 3);
      this.fx = { kind: 'whistle', at: { ...b.pos }, until: this.time + 0.8 };
      for (const a of this.agents.values()) if (a.runTarget) a.runUntil = this.time;
      return;
    }
    if (p.phase === 'flag') {
      p.t += dt;
      if (p.t > 2) { this.pendingRestart = { kind: 'clearance', side: this.opp(p.side) }; p.phase = 'done'; }
    }
  }

  private shootoutPlay(p: Extract<Play, { kind: 'shootout' }>, dt: number) {
    const taker = p.taker !== undefined ? this.agents.get(p.taker) : undefined;
    const gk = this.gk(this.opp(p.side));
    if (gk) gk.target = { x: L - 1.2, y: W / 2 };
    if (p.phase === 'setup' && p.ttl < 4.2) {
      const to = p.scored ? { x: L + 1.5, y: W / 2 + rnd(-2.8, 2.8) } : { x: L + 2, y: W / 2 + (Math.random() < 0.5 ? -8 : 8) };
      this.kick(taker ?? null, to, 22, null, 1); this.ball.dead = true;
      if (taker) taker.target = { x: L - 12, y: W / 2 };
      if (gk) gk.target = { x: L - 0.8, y: p.scored ? W / 2 + (to.y > W / 2 ? -2.5 : 2.5) : to.y };
      p.phase = 'done'; p.ttl = 2.5;
      this.commit(p);
      this.setLabel(p.scored ? `✅ ${this.agentName(p.taker)} scores` : `❌ ${this.agentName(p.taker)} misses`, p.scored ? 'goal' : 'info', 2.5);
      if (p.scored) this.fx = { kind: 'goal', at: { x: L, y: W / 2 }, until: this.time + 1.5 };
    }
    void dt;
  }

  // ───────────────────────── ball physics ─────────────────────────
  private updateBall(dt: number) {
    const b = this.ball;
    if (b.carrier !== null) {
      const c = this.agents.get(b.carrier);
      if (c) { const vx = c.vel.x, vy = c.vel.y; const sp = Math.hypot(vx, vy); b.pos = { x: c.pos.x + (sp > 0.3 ? vx / sp * 0.6 : 0.4), y: c.pos.y + (sp > 0.3 ? vy / sp * 0.6 : 0) }; b.z = 0; }
      return;
    }
    if (b.inFlight) {
      b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt;
      if (b.vz !== 0 || b.z > 0) { b.z += b.vz * dt; b.vz -= 22 * dt; if (b.z < 0) { b.z = 0; b.vz = 0; } }
      const sp = Math.hypot(b.vel.x, b.vel.y);
      if (sp > 0 && b.z === 0) { const ns = Math.max(0, sp - 3.5 * dt); b.vel = { x: b.vel.x / sp * ns, y: b.vel.y / sp * ns }; }
      const passed = b.target ? (b.pos.x - b.target.x) * b.vel.x + (b.pos.y - b.target.y) * b.vel.y > 0 : false;
      const arrived = b.target ? dist(b.pos, b.target) < 0.9 || passed || (b.z === 0 && sp < 0.6) : sp < 0.5;
      if (this.shotOutcome && arrived) { b.pos = { ...(b.target ?? b.pos) }; this.resolveShotArrival(); if (!b.inFlight) return; }
      if (arrived) {
        b.inFlight = false; b.vel = { x: 0, y: 0 }; b.z = 0;
        if (b.dead) { b.receiver = null; return; }
        const r = b.receiver !== null ? this.agents.get(b.receiver) : undefined;
        if (r && dist(r.pos, b.pos) < 1.6) this.giveBallTo(r);
        else {
          // interception if an opponent is right there, otherwise it runs loose and gets chased
          const near = this.nearestAgent(b.pos, undefined, undefined, true);
          if (near && dist(near.pos, b.pos) < 1.2) {
            this.giveBallTo(near);
            if (near.side !== this.possession && this.cur && this.cur.kind === 'possession') { this.holdTimer = 0.5; this.queue.unshift({ kind: 'possession', side: this.possession, ttl: 2 }); }
          }
        }
        b.receiver = null;
      }
      if (b.pos.x < -3 || b.pos.x > L + 3 || b.pos.y < -3 || b.pos.y > W + 3) { b.inFlight = false; b.vel = { x: 0, y: 0 }; b.pos = { x: clamp(b.pos.x, 0.5, L - 0.5), y: clamp(b.pos.y, 0.5, W - 0.5) }; }
      return;
    }
    // loose ball: whoever gets there collects it (a dead ball only by the player fetching it)
    if (b.dead) return;
    const near = this.nearestAgent(b.pos, undefined, undefined, true);
    if (near && dist(near.pos, b.pos) < 1.0) this.giveBallTo(near);
  }

  // ───────────────────────── agent steering ─────────────────────────
  private updateAgents(dt: number) {
    const b = this.ball;
    const carrier = b.carrier !== null ? this.agents.get(b.carrier) : undefined;
    const ballSide = carrier ? carrier.side : this.possession;
    const home = this.teamAgents('H'), away = this.teamAgents('A');
    const loose = b.carrier === null && !b.inFlight && !b.dead;
    const pressers = new Map<Side, Agent[]>();
    for (const side of ['H', 'A'] as Side[]) {
      const t = this.sim.team(side);
      const n = t.tactic.pressing === 'high' ? 2 : 1;
      pressers.set(side, this.teamAgents(side).filter((a) => a.role !== 'GK' && a.down <= 0).sort((x, y) => dist(x.pos, b.pos) - dist(y.pos, b.pos)).slice(0, n));
    }
    // one marker per runner: the nearest free defender picks up each active run (no crowding)
    const trackers = new Map<number, Agent>();
    for (const side of ['H', 'A'] as Side[]) {
      const opp = this.opp(side);
      const taken = new Set<number>(pressers.get(side)!.map((a) => a.id));
      const runners = this.teamAgents(opp).filter((o) => o.runTarget && this.time < o.runUntil && o.role !== 'GK' && o.celebrating <= 0);
      for (const r of runners) {
        let best: Agent | null = null, bd = 14;
        for (const d of this.teamAgents(side)) { if (taken.has(d.id) || !['CB', 'LB', 'RB', 'DM', 'CM'].includes(d.role)) continue; const dd = dist(d.pos, r.pos); if (dd < bd) { bd = dd; best = d; } }
        if (best) { taken.add(best.id); trackers.set(best.id, r); }
      }
    }
    for (const a of this.agents.values()) {
      const side = a.side; const opp = this.opp(side);
      const t = this.sim.team(side);
      const attacking = ballSide === side;
      a.jitterT -= dt; if (a.jitterT <= 0) { a.jitter = { x: rnd(-1.5, 1.5), y: rnd(-1.5, 1.5) }; a.jitterT = rnd(1.5, 4); }
      if (a.down > 0) { a.down -= dt; a.target = { ...a.pos }; a.vel = { x: 0, y: 0 }; continue; }
      if (a.celebrating > 0) a.celebrating -= dt;
      const stopped = this.cur && (this.cur.kind === 'stoppage' || this.cur.kind === 'card' || (this.cur.kind === 'foul' && (this.cur.phase === 'down' || this.cur.phase === 'setup')) || (this.cur.kind === 'offside' && this.cur.phase === 'flag') || (this.cur.kind === 'corner' && this.cur.phase === 'setup'));
      let target: Pt | null = null; let speed = 3.2;
      if (a.runTarget && this.time < a.runUntil) { target = a.runTarget; speed = a.celebrating > 0 ? 6 : a.runSpeed; }
      else {
        a.runTarget = null;
        if (stopped) { target = { ...a.pos }; speed = 1; }
        else if (b.receiver === a.id && b.inFlight) { target = { ...(b.target ?? b.pos) }; speed = 6.5; }
        else if (a.role === 'GK') {
          const g = this.toPitch(side, { x: 0, y: W / 2 });
          const dx = b.pos.x - g.x, dy = b.pos.y - g.y, len = Math.hypot(dx, dy) || 1;
          const out = clamp(len * 0.06, 1.2, 5);
          target = { x: g.x + dx / len * out, y: clamp(g.y + dy / len * out * 0.9, W / 2 - 6, W / 2 + 6) }; speed = 3.5;
          if (b.carrier === a.id) target = { ...a.pos };
        } else if (b.carrier === a.id) {
          const ahead = { x: a.pos.x + this.dir(side) * 5, y: a.pos.y };
          const press = Math.min(...this.teamAgents(opp).map((o) => dist(o.pos, ahead)));
          const att = this.toAtt(side, a.pos);
          if (press > 4.5 && att.x < 88) { target = { x: a.pos.x + this.dir(side) * 8, y: clamp(a.pos.y + a.jitter.y * 2, 2, W - 2) }; speed = press > 8 ? 6 : 4; }
          else { target = { x: a.pos.x - this.dir(side) * 0.5 + a.jitter.x * 0.5, y: a.pos.y + a.jitter.y }; speed = 2; }
        } else if (loose && pressers.get(side)!.includes(a) && dist(a.pos, b.pos) < 22) {
          target = { ...b.pos }; speed = side === this.possession ? 7 : 5.5;
        } else if (attacking) {
          const shift = this.shapeShift(side, true);
          const wide = t.tactic.width === 'wide' ? 1.04 : t.tactic.width === 'narrow' ? 0.88 : 0.96;
          const basePt = this.toPitch(side, { x: a.base.x + shift.x, y: W / 2 + (a.base.y - W / 2) * wide + shift.y });
          target = { x: clamp(basePt.x + a.jitter.x, 1.5, L - 1.5), y: clamp(basePt.y + a.jitter.y, 1.5, W - 1.5) };
          speed = 3.5;
          if (carrier) {
            const dC = dist(a.pos, carrier.pos);
            if (dC < 22 && dC > 5 && a.role !== 'CB' && !a.runTarget && Math.random() < 0.25 * dt) { const opps = this.teamAgents(opp); const candidates = [0, 1, 2, 3].map(() => { const ang = rnd(-Math.PI * 0.6, Math.PI * 0.6); const r = rnd(7, 14); return { x: carrier.pos.x + this.dir(side) * Math.cos(ang) * r, y: carrier.pos.y + Math.sin(ang) * r }; }); const best = candidates.sort((p1, p2) => Math.min(...opps.map((o) => dist(o.pos, p2))) - Math.min(...opps.map((o) => dist(o.pos, p1))))[0]; a.runTarget = { x: clamp(best.x, 2, L - 2), y: clamp(best.y, 2, W - 2) }; a.runUntil = this.time + rnd(1, 2); a.runSpeed = 6.5; }
            const cAtt = this.toAtt(side, carrier.pos).x;
            const isRunner = ['ST', 'LW', 'RW', 'AM'].includes(a.role) || (['CM', 'LB', 'RB'].includes(a.role) && Math.random() < 0.3);
            if (isRunner && cAtt > 40 && cAtt < 85 && Math.random() < 0.012 * dt * 60) {
              const line = this.defensiveLine(opp);
              const aAtt = this.toAtt(side, a.pos);
              const runX = clamp(Math.max(line - 0.8, aAtt.x) + rnd(8, 18), 50, 98);
              a.runTarget = this.toPitch(side, { x: runX, y: clamp(aAtt.y + rnd(-10, 10), 8, W - 8) }); a.runUntil = this.time + rnd(1.5, 3); a.runSpeed = 7.5;
            }
            if ((a.role === 'LB' || a.role === 'RB') && cAtt > 55 && Math.random() < 0.004 * dt * 60) { a.runTarget = this.toPitch(side, { x: clamp(this.toAtt(side, a.pos).x + rnd(15, 25), 40, 95), y: a.base.y }); a.runUntil = this.time + 3; a.runSpeed = 7; }
          }
        } else {
          const shift = this.shapeShift(side, false);
          const basePt = this.toPitch(side, { x: a.base.x + shift.x, y: W / 2 + (a.base.y - W / 2) * 0.8 + shift.y });
          target = { x: clamp(basePt.x + a.jitter.x * 0.6, 1.5, L - 1.5), y: clamp(basePt.y + a.jitter.y * 0.6, 1.5, W - 1.5) };
          speed = 3.5;
          const pr = pressers.get(side)!;
          if (pr.includes(a) && (b.carrier !== null || b.inFlight) && !b.dead) { const bp = b.carrier !== null ? b.pos : (b.target ?? b.pos); target = { x: bp.x - this.dir(side) * 0.8, y: bp.y }; speed = t.tactic.pressing === 'high' ? 7.5 : 6; }
          else { const runner = trackers.get(a.id); if (runner) { target = { x: runner.pos.x + this.dir(side) * 1.2, y: runner.pos.y }; speed = 7; } }
        }
      }
      if (!target) target = a.pos;
      a.target = target;
      const dx = target.x - a.pos.x, dy = target.y - a.pos.y; const d = Math.hypot(dx, dy);
      const maxSp = speed * a.pace;
      const desired = d < 0.3 ? { x: 0, y: 0 } : { x: dx / d * Math.min(maxSp, d * 2.2), y: dy / d * Math.min(maxSp, d * 2.2) };
      const k = 1 - Math.exp(-dt / 0.28);
      a.vel.x = lerp(a.vel.x, desired.x, k); a.vel.y = lerp(a.vel.y, desired.y, k);
      a.pos.x = clamp(a.pos.x + a.vel.x * dt, -1, L + 1); a.pos.y = clamp(a.pos.y + a.vel.y * dt, -1, W + 1);
    }
    const all = [...home, ...away];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const p = all[i], q = all[j]; const d = dist(p.pos, q.pos);
      if (d < 2.2 && d > 0.001) { const push = (2.2 - d) * 0.45; const nx = (q.pos.x - p.pos.x) / d, ny = (q.pos.y - p.pos.y) / d; p.pos.x -= nx * push; p.pos.y -= ny * push; q.pos.x += nx * push; q.pos.y += ny * push; }
    }
  }

  /** How far the team's shape moves (in attacking coords) with the ball */
  private shapeShift(side: Side, attacking: boolean): Pt {
    const bAtt = this.toAtt(side, this.ball.pos);
    const t = this.sim.team(side);
    const line = t.tactic.line === 'high' ? 8 : t.tactic.line === 'deep' ? -6 : 0;
    const ment = t.tactic.mentality === 'very-attacking' ? 8 : t.tactic.mentality === 'attacking' ? 4 : t.tactic.mentality === 'defensive' ? -4 : t.tactic.mentality === 'very-defensive' ? -8 : 0;
    const x = attacking ? clamp((bAtt.x - 30) * 0.62, -6, 42) + ment * 0.5 : clamp((bAtt.x - 45) * 0.55, -12, 28) + line;
    const y = (bAtt.y - W / 2) * (attacking ? 0.22 : 0.35);
    return { x, y };
  }

  // ───────────────────────── rendering ─────────────────────────
  draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, colors: { home: string; away: string; homeText: string; awayText: string; homeShort: string; awayShort: string }, showNames: boolean) {
    const s = cw / (L + 8);
    const X = (x: number) => (x + 4) * s, Y = (y: number) => (y + 4) * s;
    ctx.fillStyle = '#2b6b36'; ctx.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.03)'; ctx.fillRect(X(i * 10.5), Y(0), 10.5 * s, W * s); }
    ctx.strokeStyle = 'rgba(255,255,255,0.78)'; ctx.lineWidth = Math.max(1, s * 0.15);
    ctx.strokeRect(X(0), Y(0), L * s, W * s);
    ctx.beginPath(); ctx.moveTo(X(L / 2), Y(0)); ctx.lineTo(X(L / 2), Y(W)); ctx.stroke();
    ctx.beginPath(); ctx.arc(X(L / 2), Y(W / 2), 9.15 * s, 0, Math.PI * 2); ctx.stroke();
    for (const side of [0, 1]) {
      ctx.strokeRect(side === 0 ? X(0) : X(L - 16.5), Y(W / 2 - 20.15), 16.5 * s, 40.3 * s);
      ctx.strokeRect(side === 0 ? X(0) : X(L - 5.5), Y(W / 2 - 9.16), 5.5 * s, 18.32 * s);
      ctx.beginPath(); ctx.arc(side === 0 ? X(11) : X(L - 11), Y(W / 2), s * 0.3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(side === 0 ? X(-2.4) : X(L), Y(W / 2 - 3.66), 2.4 * s, 7.32 * s);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(side === 0 ? X(-2.4) : X(L), Y(W / 2 - 3.66), 2.4 * s, 7.32 * s); ctx.strokeStyle = 'rgba(255,255,255,0.78)';
    }
    if (this.fx && this.time < this.fx.until) {
      const a = clamp((this.fx.until - this.time) / 2, 0, 1);
      const col = this.fx.kind === 'goal' ? `rgba(245,197,24,${a * 0.55})` : this.fx.kind === 'save' ? `rgba(143,211,255,${a * 0.5})` : this.fx.kind === 'post' ? `rgba(255,255,255,${a * 0.6})` : `rgba(255,255,255,${a * 0.25})`;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(this.fx.at.x), Y(this.fx.at.y), (this.fx.kind === 'goal' ? 9 : 4) * s * (1.4 - a * 0.6), 0, Math.PI * 2); ctx.fill();
    } else this.fx = null;
    const r = Math.max(6, s * 1.5);
    const font = getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const list = [...this.agents.values()].sort((a, b) => a.pos.y - b.pos.y);
    for (const a of list) {
      const col = a.side === 'H' ? colors.home : colors.away;
      const fg = a.side === 'H' ? colors.homeText : colors.awayText;
      const px = X(a.pos.x), py = Y(a.pos.y);
      const sp = Math.hypot(a.vel.x, a.vel.y);
      if (sp > 4.5) { ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = r * 0.8; ctx.beginPath(); ctx.moveTo(px - a.vel.x / sp * r * 1.6, py - a.vel.y / sp * r * 1.6); ctx.lineTo(px, py); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.beginPath(); ctx.arc(px, py + r * 0.3, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
      if (a.down > 0) { ctx.beginPath(); ctx.ellipse(px, py, r * 1.4, r * 0.7, 0, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke(); continue; }
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      ctx.lineWidth = this.ball.carrier === a.id ? 2.5 : 1.5; ctx.strokeStyle = this.ball.carrier === a.id ? '#ffffff' : a.side === 'H' ? 'rgba(255,255,255,0.8)' : 'rgba(20,20,20,0.7)'; ctx.stroke();
      ctx.fillStyle = fg; ctx.font = `700 ${Math.max(8, r * 0.95)}px ${font}`; ctx.fillText(String(this.players[a.id]?.number ?? ''), px, py);
      const team = this.sim.team(a.side); if (team.yellow.has(a.id)) { ctx.fillStyle = '#f5c518'; ctx.fillRect(px + r * 0.6, py - r * 1.25, r * 0.5, r * 0.7); }
      if (showNames || this.ball.carrier === a.id || (a.label && this.time < a.labelUntil)) { ctx.font = `600 ${Math.max(8, r * 0.8)}px ${font}`; const txt = a.label && this.time < a.labelUntil ? a.label : this.agentName(a.id); const tw = ctx.measureText(txt).width + 8; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(px - tw / 2, py + r * 1.15, tw, r * 1.1); ctx.fillStyle = '#fff'; ctx.fillText(txt, px, py + r * 1.7); }
    }
    const b = this.ball;
    const bx = X(b.pos.x), by = Y(b.pos.y);
    ctx.beginPath(); ctx.arc(bx, by + r * 0.25, r * 0.42, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    const lift = b.z * s * 0.5;
    ctx.beginPath(); ctx.arc(bx, by - lift, r * (0.45 + b.z * 0.03), 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = `800 ${Math.max(9, s * 1.6)}px ${font}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(`${colors.homeShort} ▶`, X(1), Y(-2)); ctx.textAlign = 'right'; ctx.fillText(`◀ ${colors.awayShort}`, X(L - 1), Y(-2));
    ctx.textAlign = 'center'; ctx.font = `700 ${Math.max(9, s * 1.5)}px ${font}`; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(`${this.score[0]} – ${this.score[1]}   ${this.displayMinute}`, X(L / 2), Y(-2));
    const lb = this.label;
    if (lb && this.time < lb.until) {
      ctx.font = `700 ${Math.max(11, s * 2.1)}px ${font}`;
      const text = lb.text.length > 72 ? lb.text.slice(0, 70) + '…' : lb.text;
      const tw = ctx.measureText(text).width + 24;
      const bg = lb.kind === 'goal' ? 'rgba(20,80,40,0.93)' : lb.kind === 'card' ? 'rgba(90,60,10,0.93)' : lb.kind === 'save' ? 'rgba(20,50,80,0.93)' : 'rgba(0,0,0,0.65)';
      const bh = Math.max(20, s * 3.4);
      ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(cw / 2 - tw / 2, Y(W) + s * 0.6, tw, bh, 6); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, cw / 2, Y(W) + s * 0.6 + bh / 2);
    } else if (lb) this.label = null;
  }
}
