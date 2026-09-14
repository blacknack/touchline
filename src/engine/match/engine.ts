import { Club, Fixture, Lineup, MatchEvent, MatchResult, Player, Pos, Tactic, TeamMatchStats } from '../types';
import { RNG, clamp } from '../rng';
import { FORMATIONS, FormationSlot, kickoffAbility } from '../tactics';
import { ovrAtPosition } from '../attributes';
import { say } from './commentary';

export type Side = 'H' | 'A';
const other = (s: Side): Side => (s === 'H' ? 'A' : 'H');

interface OnPitch { id: number; pos: Pos; slot: number; }

export interface TeamState {
  side: Side;
  club: Club;
  tactic: Tactic;
  slots: FormationSlot[];
  onPitch: OnPitch[];
  bench: number[];
  subsUsed: number;
  subWindows: number;
  lastSubMinute: number;
  goals: number;
  stats: TeamMatchStats;
  ratings: Record<number, number>;
  minutes: Record<number, number>;
  fatigue: Record<number, number>;   // 0..1 remaining energy
  yellow: Set<number>;
  sentOff: number[];
  starters: number[];
  benchStart: number[];
  scorers: { playerId: number; minute: number; type: string }[];
  captain: number | null;
  penTaker: number | null;
  fkTaker: number | null;
  ckTaker: number | null;
  // cached strengths
  att: number; mid: number; def: number; gk: number; aerial: number; pace: number; discipline: number;
  isUser: boolean;
  momentum: number;
}

export interface MatchOptions {
  seed: number;
  homeLineup: Lineup;
  awayLineup: Lineup;
  homeTactic: Tactic;
  awayTactic: Tactic;
  knockout: boolean;         // needs winner: ET + pens
  neutral: boolean;
  userSide: Side | null;
  aggregate?: [number, number]; // first-leg score (home of THIS match first) if second leg
  awayGoalsRule?: boolean;
  importance?: number;       // 0.5..1.5
  autoSubs?: boolean;        // let the AI make substitutions for the user's team too
}

export interface MinuteSnapshot {
  minute: number; added: number; period: number; score: [number, number]; momentum: number; possession: [number, number]; events: MatchEvent[]; attacking: Side;
}

const MENTALITY_ATT: Record<Tactic['mentality'], number> = { 'very-defensive': 0.78, defensive: 0.89, balanced: 1.0, attacking: 1.1, 'very-attacking': 1.2 };
const MENTALITY_DEF: Record<Tactic['mentality'], number> = { 'very-defensive': 1.14, defensive: 1.07, balanced: 1.0, attacking: 0.93, 'very-attacking': 0.85 };

export class MatchSim {
  rng: RNG;
  players: Record<number, Player>;
  fixture: Fixture;
  opts: MatchOptions;
  H: TeamState;
  A: TeamState;
  minute = 0;
  added = 0;
  period: 1 | 2 | 3 | 4 | 5 = 1; // 5 = shootout
  addedTime = 0;
  events: MatchEvent[] = [];
  finished = false;
  inShootout = false;
  pens: [number, number] = [0, 0];
  possession: [number, number] = [0, 0];
  lastEventMinute = 0;
  lastAttacking: Side = 'H';
  attendance: number;
  venue: string;
  varPending = false;

  constructor(players: Record<number, Player>, homeClub: Club, awayClub: Club, fixture: Fixture, opts: MatchOptions) {
    this.players = players;
    this.fixture = fixture;
    this.opts = opts;
    this.rng = new RNG(opts.seed);
    this.H = this.makeTeam('H', homeClub, opts.homeLineup, opts.homeTactic, opts.userSide === 'H');
    this.A = this.makeTeam('A', awayClub, opts.awayLineup, opts.awayTactic, opts.userSide === 'A');
    this.venue = homeClub.stadium;
    const interest = 0.55 + (homeClub.reputation + awayClub.reputation) / 400 + (opts.importance ?? 1) * 0.1;
    this.attendance = Math.min(homeClub.capacity, Math.round(homeClub.capacity * clamp(interest + this.rng.float(-0.08, 0.08), 0.35, 1)));
    this.recompute(this.H); this.recompute(this.A);
    this.push('kickoff', null, { team: homeClub.name });
  }

  private makeTeam(side: Side, club: Club, lineup: Lineup, tactic: Tactic, isUser: boolean): TeamState {
    const slots = FORMATIONS[tactic.formation] ?? FORMATIONS['4-3-3'];
    const onPitch: OnPitch[] = [];
    lineup.starters.forEach((id, i) => { if (id !== null && this.players[id]) onPitch.push({ id, pos: slots[i]?.pos ?? 'CM', slot: i }); });
    const bench = lineup.bench.filter((x): x is number => x !== null && !!this.players[x]);
    const t: TeamState = {
      side, club, tactic, slots, onPitch, bench, subsUsed: 0, subWindows: 0, lastSubMinute: -10, goals: 0,
      stats: { possession: 50, shots: 0, onTarget: 0, blocked: 0, xg: 0, corners: 0, fouls: 0, offsides: 0, yellows: 0, reds: 0, saves: 0, bigChances: 0, passes: 0, passAcc: 0, tackles: 0 },
      ratings: {}, minutes: {}, fatigue: {}, yellow: new Set(), sentOff: [], starters: onPitch.map((o) => o.id), benchStart: bench.slice(),
      scorers: [], captain: lineup.captain, penTaker: lineup.penaltyTaker, fkTaker: lineup.freeKickTaker, ckTaker: lineup.cornerTaker,
      att: 0, mid: 0, def: 0, gk: 0, aerial: 0, pace: 0, discipline: 0, isUser, momentum: 0,
    };
    for (const o of onPitch) { t.ratings[o.id] = 6.0; t.minutes[o.id] = 0; t.fatigue[o.id] = 0.7 + 0.3 * this.players[o.id].condition / 100; }
    for (const id of bench) { t.ratings[id] = 0; t.minutes[id] = 0; t.fatigue[id] = 0.7 + 0.3 * this.players[id].condition / 100; }
    return t;
  }

  team(side: Side) { return side === 'H' ? this.H : this.A; }

  private eff(t: TeamState, o: OnPitch): number {
    const p = this.players[o.id];
    const f = t.fatigue[o.id] ?? 1;
    const fatigueMul = 0.72 + 0.28 * clamp(f, 0, 1);
    return kickoffAbility(p, o.pos) * fatigueMul;
  }

  /** Recompute team strength aggregates (call after subs, cards, every few minutes for fatigue) */
  recompute(t: TeamState) {
    const P = this.players;
    let att = 0, attN = 0, mid = 0, midN = 0, def = 0, defN = 0, gk = 45, aerial = 0, aerN = 0, pace = 0, paceN = 0, disc = 0;
    for (const o of t.onPitch) {
      const p = P[o.id];
      const e = this.eff(t, o);
      const a = p.attrs;
      const fm = 0.72 + 0.28 * clamp(t.fatigue[o.id] ?? 1, 0, 1);
      if (o.pos === 'GK') { gk = e; continue; }
      const y = t.slots[o.slot]?.y ?? 50;
      // contribution weights by pitch height
      const attW = y >= 75 ? 1 : y >= 60 ? 0.7 : y >= 45 ? 0.35 : 0.12;
      const midW = y >= 40 && y <= 70 ? 1 : y > 70 ? 0.45 : 0.4;
      const defW = y <= 30 ? 1 : y <= 48 ? 0.7 : y <= 62 ? 0.3 : 0.08;
      const attSkill = (a.finishing * 1.2 + a.dribbling + a.technique + a.composure * 0.8 + a.pace * 0.6 + a.vision * 0.5 + a.crossing * 0.3) / 5.4;
      const midSkill = (a.passing * 1.2 + a.vision + a.technique + a.workRate + a.decisions + a.stamina * 0.6 + a.anticipation * 0.5) / 6.3;
      const defSkill = (a.marking * 1.2 + a.tackling * 1.2 + a.positioning * 1.1 + a.anticipation + a.heading * 0.6 + a.strength * 0.6 + a.pace * 0.4) / 6.1;
      att += attW * attSkill * 5 * fm; attN += attW;
      mid += midW * midSkill * 5 * fm; midN += midW;
      def += defW * defSkill * 5 * fm; defN += defW;
      aerial += (a.heading + a.jumping + a.strength) / 3 * 5; aerN++;
      pace += (a.pace + a.acceleration) / 2 * 5; paceN++;
      disc += a.aggression;
    }
    // scale attack/def by number of players (10 men penalty)
    const n = t.onPitch.length;
    const menMul = n >= 11 ? 1 : n === 10 ? 0.86 : n === 9 ? 0.72 : 0.5;
    t.att = (attN ? att / attN : 40) * MENTALITY_ATT[t.tactic.mentality] * menMul;
    t.mid = (midN ? mid / midN : 40) * menMul;
    t.def = (defN ? def / defN : 40) * MENTALITY_DEF[t.tactic.mentality] * (n >= 11 ? 1 : n === 10 ? 0.9 : 0.78);
    t.gk = gk;
    t.aerial = aerN ? aerial / aerN : 50;
    t.pace = paceN ? pace / paceN : 50;
    t.discipline = n ? disc / n : 10;
    if (t.tactic.line === 'high') t.def *= 0.97;
    if (t.tactic.line === 'deep') { t.def *= 1.03; t.att *= 0.97; }
    if (t.tactic.pressing === 'high') { t.mid *= 1.05; }
    if (t.tactic.pressing === 'low') { t.mid *= 0.96; t.def *= 1.02; }
    if (t.tactic.width === 'wide') t.att *= 1.02;
  }

  private name(id: number) { return this.players[id]?.name ?? '?'; }
  private scoreStr() { return `${this.H.club.short} ${this.H.goals}-${this.A.goals} ${this.A.club.short}`; }

  push(type: MatchEvent['type'], side: Side | null, ctx: Record<string, any> = {}, ids: { playerId?: number; secondaryId?: number; xg?: number } = {}) {
    const text = say(this.rng, ctx.key ?? type, { ...ctx, score: this.scoreStr(), venue: this.venue });
    const ev: MatchEvent = { minute: this.minute, added: this.added, type, side, text, score: [this.H.goals, this.A.goals], ...ids };
    this.events.push(ev);
    return ev;
  }

  // ───────────────────────── player selection helpers ─────────────────────────
  private pickAttacker(t: TeamState, kind: 'shooter' | 'header' | 'longshot' | 'creator' | 'dribbler'): OnPitch {
    const P = this.players;
    const cands = t.onPitch.filter((o) => o.pos !== 'GK');
    const w = cands.map((o) => {
      const p = P[o.id]; const a = p.attrs; const y = t.slots[o.slot]?.y ?? 50;
      const posW = y >= 80 ? 2.4 : y >= 65 ? 2.0 : y >= 50 ? 1.1 : y >= 40 ? 0.45 : 0.15;
      switch (kind) {
        case 'shooter': return posW * (a.finishing + a.positioning * 0.8 + a.anticipation * 0.6 + a.composure * 0.4 + 6);
        case 'header': return (y >= 15 ? posW + 0.5 : posW) * (a.heading * 1.6 + a.jumping + a.strength * 0.5);
        case 'longshot': return (y >= 40 && y <= 75 ? 1.5 : 0.7) * (a.longShots * 1.8 + a.technique * 0.4);
        case 'creator': return (y >= 40 ? 1.3 : 0.5) * (a.passing + a.vision * 1.3 + a.crossing * 0.6 + a.technique * 0.5);
        default: return posW * (a.dribbling * 1.5 + a.pace + a.flair);
      }
    });
    return this.rng.weighted(cands, w);
  }
  private pickDefender(t: TeamState, kind: 'tackler' | 'blocker' | 'marker' | 'any'): OnPitch {
    const P = this.players;
    const cands = t.onPitch.filter((o) => o.pos !== 'GK');
    if (!cands.length) return t.onPitch[0];
    const w = cands.map((o) => {
      const p = P[o.id]; const a = p.attrs; const y = t.slots[o.slot]?.y ?? 50;
      const posW = y <= 30 ? 3 : y <= 50 ? 1.8 : y <= 65 ? 0.9 : 0.3;
      switch (kind) {
        case 'tackler': return posW * (a.tackling + a.aggression * 0.8 + a.workRate * 0.5 + 5) * (t.yellow.has(o.id) ? 0.3 : 1);
        case 'blocker': return posW * (a.positioning + a.marking + 5);
        case 'marker': return posW * (a.marking + a.positioning + 5);
        default: return posW + 0.5;
      }
    });
    return this.rng.weighted(cands, w);
  }
  private gkOf(t: TeamState): OnPitch | undefined { return t.onPitch.find((o) => o.pos === 'GK'); }

  private addRating(t: TeamState, id: number, delta: number) { if (t.ratings[id] !== undefined && t.ratings[id] > 0) t.ratings[id] = clamp(t.ratings[id] + delta * 1.35, 3, 10); }

  // ───────────────────────── main step ─────────────────────────
  /** Advance one minute. Returns snapshot; sets finished when done. */
  step(): MinuteSnapshot {
    const before = this.events.length;
    if (this.finished) return this.snapshot(before);
    if (this.inShootout) { this.shootoutKick(); return this.snapshot(before); }

    const periodEnd = this.period === 1 ? 45 : this.period === 2 ? 90 : this.period === 3 ? 105 : 120;
    if (this.minute >= periodEnd && this.added >= this.addedTime) {
      this.endPeriod();
      return this.snapshot(before);
    }
    // advance clock
    if (this.minute < periodEnd) this.minute++;
    else this.added++;
    if (this.minute === periodEnd && this.added === 0) {
      this.addedTime = this.calcAddedTime();
      this.push('added_time', null, { min: this.addedTime });
    }

    this.simulateMinute();
    if (!this.finished && !this.inShootout) this.injuryTick();
    return this.snapshot(before);
  }

  private snapshot(from: number): MinuteSnapshot {
    const tot = this.possession[0] + this.possession[1] || 1;
    return { minute: this.minute, added: this.added, period: this.period, score: [this.H.goals, this.A.goals], momentum: this.H.momentum - this.A.momentum, possession: [Math.round(100 * this.possession[0] / tot), Math.round(100 * this.possession[1] / tot)], events: this.events.slice(from), attacking: this.lastAttacking };
  }

  private calcAddedTime(): number {
    const base = this.period === 1 ? 1.6 : this.period === 2 ? 4.2 : 1.2;
    const recent = this.events.filter((e) => e.minute > this.minute - 45 && ['goal', 'pen_goal', 'sub', 'injury', 'yellow', 'red', 'var', 'penalty_awarded'].includes(e.type)).length;
    return clamp(Math.round(base + recent * 0.35 + this.rng.float(-0.8, 1.2)), 1, 9);
  }

  private endPeriod() {
    this.added = 0; this.addedTime = 0;
    if (this.period === 1) { this.period = 2; this.push('halftime', null, {}); this.halfTimeRecovery(); return; }
    if (this.period === 2) {
      if (this.needsWinner()) { this.period = 3; this.push('et_start', null, {}); this.halfTimeRecovery(0.3); return; }
      this.finish(); return;
    }
    if (this.period === 3) { this.period = 4; this.push('et_half', null, {}); return; }
    if (this.period === 4) {
      if (this.needsWinner()) { this.push('et_end', null, {}); this.startShootout(); return; }
      this.finish(); return;
    }
  }

  private halfTimeRecovery(mul = 1) {
    for (const t of [this.H, this.A]) for (const o of t.onPitch) t.fatigue[o.id] = clamp((t.fatigue[o.id] ?? 1) + 0.06 * mul, 0, 1);
  }

  /** Whether a winner is required and the tie is level */
  private needsWinner(): boolean {
    if (!this.opts.knockout) return false;
    const agg = this.opts.aggregate;
    let h = this.H.goals, a = this.A.goals;
    if (agg) { h += agg[0]; a += agg[1]; }
    return h === a;
  }

  private finish() {
    this.finished = true;
    this.push('fulltime', null, {});
    for (const t of [this.H, this.A]) for (const o of t.onPitch) t.minutes[o.id] = t.minutes[o.id]; // no-op placeholder
  }

  // ───────────────────────── shootout ─────────────────────────
  private shootoutOrder: [number[], number[]] = [[], []];
  shootoutIdx = 0;
  private shootoutFirst: Side = 'H';
  private startShootout() {
    this.inShootout = true; this.period = 5;
    this.push('shootout_start', null, { key: 'et_end' });
    const order = (t: TeamState) => t.onPitch.filter((o) => o.pos !== 'GK').map((o) => o.id).sort((a, b) => (this.players[b].attrs.penalties + this.players[b].attrs.composure) - (this.players[a].attrs.penalties + this.players[a].attrs.composure));
    this.shootoutFirst = this.rng.chance(0.5) ? 'H' : 'A';
    this.shootoutOrder = [order(this.H), order(this.A)];
    this.shootoutIdx = 0;
  }
  private shootoutKick() {
    const kickN = Math.floor(this.shootoutIdx / 2);
    const sideIdx = this.shootoutIdx % 2;
    const side: Side = sideIdx === 0 ? this.shootoutFirst : other(this.shootoutFirst);
    const t = this.team(side); const opp = this.team(other(side));
    const list = this.shootoutOrder[side === 'H' ? 0 : 1];
    const taker = list[kickN % Math.max(1, list.length)];
    const gk = this.gkOf(opp);
    const p = this.players[taker];
    const gkP = gk ? this.players[gk.id] : null;
    const skill = (p.attrs.penalties * 1.2 + p.attrs.composure) / 2.2;
    const gkSkill = gkP ? (gkP.attrs.reflexes + gkP.attrs.oneOnOnes * 0.5 + gkP.attrs.agility * 0.5) / 2 : 8;
    const pressure = kickN >= 4 ? 0.03 : 0;
    const pScore = clamp(0.62 + (skill - 10) * 0.02 - (gkSkill - 10) * 0.012 - pressure, 0.45, 0.92);
    const idx = side === 'H' ? 0 : 1;
    if (this.rng.chance(pScore)) { this.pens[idx]++; this.push('shootout_goal', side, { p: p.name, score: `${this.pens[0]}-${this.pens[1]}` }, { playerId: taker }); }
    else { this.push('shootout_miss', side, { p: p.name, gk: gkP?.name }, { playerId: taker }); if (gkP && this.rng.chance(0.6)) this.addRating(opp, gkP.id, 0.3); }
    this.shootoutIdx++;
    // decide
    const kicksTaken = [0, 0]; kicksTaken[this.shootoutFirst === 'H' ? 0 : 1] = Math.ceil(this.shootoutIdx / 2); kicksTaken[this.shootoutFirst === 'H' ? 1 : 0] = Math.floor(this.shootoutIdx / 2);
    const rem = [5 - kicksTaken[0], 5 - kicksTaken[1]];
    const decided = (this.shootoutIdx >= 10 && kicksTaken[0] === kicksTaken[1] && this.pens[0] !== this.pens[1]) ||
      (this.shootoutIdx < 10 && (this.pens[0] > this.pens[1] + Math.max(0, rem[1]) || this.pens[1] > this.pens[0] + Math.max(0, rem[0])));
    if (decided) { this.inShootout = false; this.finished = true; this.push('shootout_end', null, { key: 'fulltime' }); }
  }

  // ───────────────────────── minute simulation ─────────────────────────
  private simulateMinute() {
    const H = this.H, A = this.A;
    const rng = this.rng;
    // fatigue drain
    for (const t of [H, A]) {
      const tempoMul = t.tactic.tempo === 'fast' ? 1.15 : t.tactic.tempo === 'slow' ? 0.9 : 1;
      const pressMul = t.tactic.pressing === 'high' ? 1.2 : t.tactic.pressing === 'low' ? 0.9 : 1;
      for (const o of t.onPitch) {
        const p = this.players[o.id];
        const stam = p.attrs.stamina;
        const drain = (o.pos === 'GK' ? 0.0015 : 0.0075 * (1.35 - stam / 30)) * tempoMul * pressMul * (this.period >= 3 ? 1.3 : 1);
        t.fatigue[o.id] = clamp((t.fatigue[o.id] ?? 1) - drain, 0.05, 1);
        t.minutes[o.id] = (t.minutes[o.id] ?? 0) + 1;
        if (this.period <= 2) t.ratings[o.id] = clamp((t.ratings[o.id] ?? 6) + 0.0045, 3, 10);
      }
    }
    if (this.minute % 5 === 0) { this.recompute(H); this.recompute(A); }
    // AI subs / tactics
    if (this.period <= 4 && this.added === 0) this.aiDecisions();

    // possession share this minute
    const homeAdv = this.opts.neutral ? 1 : 1.08;
    const hm = Math.pow(H.mid * homeAdv, 3), am = Math.pow(A.mid, 3);
    const pH = hm / (hm + am);
    const attacking: Side = rng.chance(pH) ? 'H' : 'A';
    this.lastAttacking = attacking;
    const T = this.team(attacking), D = this.team(other(attacking));
    this.possession[attacking === 'H' ? 0 : 1] += 1;
    T.momentum = clamp(T.momentum * 0.9 + 0.1, -1, 1); D.momentum = clamp(D.momentum * 0.9 - 0.05, -1, 1);

    // chance to create an attacking situation this minute
    const tempo = T.tactic.tempo === 'fast' ? 1.12 : T.tactic.tempo === 'slow' ? 0.9 : 1;
    const oppPress = D.tactic.pressing === 'high' ? 1.06 : 1;
    const counterBonus = T.tactic.counter && D.tactic.mentality !== 'defensive' && D.tactic.mentality !== 'very-defensive' && D.tactic.line === 'high' ? 1.12 : 1;
    const waste = T.tactic.timeWasting && this.period === 2 && this.minute > 70 ? 0.7 : 1;
    // quality ratio: attack vs defence
    const ratio = (T.att * (attacking === 'H' ? homeAdv : 1)) / D.def;
    const situationP = clamp(0.55 * tempo * oppPress * counterBonus * waste * Math.pow(ratio, 1.2) * (this.period >= 3 ? 0.8 : 1), 0.05, 0.75);
    if (!rng.chance(situationP)) {
      // quiet minute: occasional foul / commentary
      if (rng.chance(0.30)) this.foul(D, T, 'midfield');
      else if (rng.chance(0.05) && this.minute - this.lastEventMinute > 6) { this.lastEventMinute = this.minute; this.push('commentary', null, { key: T.momentum > 0.5 ? 'pressure' : 'quiet', team: T.club.name }); }
      return;
    }
    this.attack(T, D, ratio);
  }

  private attack(T: TeamState, D: TeamState, ratio: number) {
    const rng = this.rng;
    // Resolve the attacking move: outcomes weighted
    const dPress = D.tactic.pressing;
    const wShot = 0.42 * Math.pow(ratio, 0.55);
    const wCorner = 0.20;
    const wFoulAtt = 0.15 * (1 + (D.discipline - 10) * 0.03);
    const wOffside = 0.08 * (D.tactic.line === 'high' ? 1.5 : D.tactic.line === 'deep' ? 0.6 : 1) * (T.pace > D.pace ? 1.15 : 0.9);
    const wBreak = 0.32 * (dPress === 'high' ? 1.1 : 1) / Math.pow(ratio, 0.6);
    const outcome = rng.weighted(['shot', 'corner', 'foul', 'offside', 'break'], [wShot, wCorner, wFoulAtt, wOffside, wBreak]);
    switch (outcome) {
      case 'shot': this.shot(T, D, 'open', ratio); break;
      case 'corner': this.corner(T, D); break;
      case 'foul': this.foul(D, T, 'attack'); break;
      case 'offside': { const o = this.pickAttacker(T, 'shooter'); T.stats.offsides++; this.push('offside', T.side, { p: this.name(o.id) }, { playerId: o.id }); break; }
      default: { // attack breaks down: defensive credit
        const d = this.pickDefender(D, 'tackler'); D.stats.tackles++; this.addRating(D, d.id, 0.05); T.stats.passes += 4; break;
      }
    }
  }

  private corner(T: TeamState, D: TeamState) {
    const rng = this.rng;
    T.stats.corners++;
    this.push('corner', T.side, { team: T.club.name });
    const taker = T.ckTaker && T.onPitch.some((o) => o.id === T.ckTaker) ? T.ckTaker : this.pickAttacker(T, 'creator').id;
    const tk = this.players[taker];
    const deliver = (tk.attrs.corners + tk.attrs.crossing) / 2;
    // aerial duel
    const aerialRatio = (T.aerial + deliver * 2) / (D.aerial + (this.gkOf(D) ? this.players[this.gkOf(D)!.id].attrs.command * 2.5 : 30));
    const pChance = clamp(0.20 * Math.pow(aerialRatio, 1.5), 0.05, 0.42);
    if (rng.chance(pChance)) {
      const header = rng.chance(0.72);
      this.shot(T, D, header ? 'header' : 'setpiece', aerialRatio, taker);
    } else if (rng.chance(0.12)) {
      this.push('commentary', T.side, { key: 'quiet', team: T.club.name });
    }
  }

  private foul(F: TeamState, V: TeamState, zone: 'midfield' | 'attack') {
    // F fouls V
    const rng = this.rng;
    const d = this.pickDefender(F, 'tackler');
    const v = zone === 'attack' ? this.pickAttacker(V, 'dribbler') : this.pickAttacker(V, 'creator');
    F.stats.fouls++;
    const dp = this.players[d.id];
    // penalty?
    const inBox = zone === 'attack' && rng.chance(0.042);
    if (inBox) {
      this.push('penalty_awarded', V.side, { team: V.club.name, p: this.name(v.id), d: dp.name }, { playerId: v.id, secondaryId: d.id });
      this.card(F, d.id, rng.chance(0.55) ? 'yellow' : rng.chance(0.08) ? 'red' : 'none', v.id);
      this.penalty(V, F);
      return;
    }
    const aggr = dp.attrs.aggression;
    const yellowP = clamp(0.115 + (aggr - 10) * 0.012 + (zone === 'attack' ? 0.08 : 0) + (this.period >= 2 && this.minute > 75 ? 0.04 : 0), 0.05, 0.45) * (F.yellow.has(d.id) ? 0.45 : 1);
    const redP = 0.0028 + (aggr > 15 ? 0.003 : 0);
    const r = rng.next();
    if (r < redP) { this.push('foul', V.side, { key: 'foul', team: V.club.name, p: this.name(v.id), d: dp.name }, { playerId: v.id, secondaryId: d.id }); this.card(F, d.id, 'red', v.id); }
    else if (r < redP + yellowP) { this.card(F, d.id, 'yellow', v.id); }
    else if (zone === 'attack') { this.push('freekick', V.side, { team: V.club.name, p: this.name(v.id), d: dp.name }, { playerId: v.id, secondaryId: d.id }); }
    else if (rng.chance(0.35)) { this.push('foul', V.side, { team: V.club.name, p: this.name(v.id), d: dp.name }, { playerId: v.id, secondaryId: d.id }); }
    // free kick opportunity in attack zone
    if (zone === 'attack') {
      const direct = rng.chance(0.3);
      if (direct) {
        const taker = V.fkTaker && V.onPitch.some((o) => o.id === V.fkTaker) ? V.fkTaker : this.pickAttacker(V, 'creator').id;
        this.shot(V, F, 'freekick', 1, undefined, taker);
      } else if (rng.chance(0.4)) {
        // cross from free kick -> header chance
        const aerialRatio = V.aerial / (F.aerial + 15);
        if (rng.chance(clamp(0.22 * aerialRatio, 0.05, 0.4))) this.shot(V, F, 'header', aerialRatio, V.fkTaker ?? undefined);
      }
    }
  }

  private card(t: TeamState, id: number, kind: 'yellow' | 'red' | 'none', victim?: number) {
    if (kind === 'none') return;
    const opp = this.team(other(t.side));
    const p = this.players[id];
    if (kind === 'yellow') {
      if (t.yellow.has(id)) {
        t.stats.reds++; t.stats.yellows++;
        this.push('second_yellow', t.side, { d: p.name, opp: t.club.name, p: victim ? this.name(victim) : undefined }, { playerId: id, secondaryId: victim });
        this.sendOff(t, id);
      } else {
        t.yellow.add(id); t.stats.yellows++;
        this.push('yellow', t.side, { d: p.name, p: victim ? this.name(victim) : 'his opponent' }, { playerId: id, secondaryId: victim });
        this.addRating(t, id, -0.2);
      }
    } else {
      t.stats.reds++;
      this.push('red', t.side, { d: p.name, opp: t.club.name, p: victim ? this.name(victim) : 'his opponent' }, { playerId: id, secondaryId: victim });
      this.sendOff(t, id);
    }
    void opp;
  }
  private sendOff(t: TeamState, id: number) {
    t.onPitch = t.onPitch.filter((o) => o.id !== id);
    t.sentOff.push(id);
    this.addRating(t, id, -1.2);
    this.recompute(t);
    if (t.isUser === false) this.aiReshapeAfterRed(t);
  }

  private penalty(T: TeamState, D: TeamState) {
    const rng = this.rng;
    const takerId = T.penTaker && T.onPitch.some((o) => o.id === T.penTaker) ? T.penTaker : this.pickAttacker(T, 'shooter').id;
    const taker = this.players[takerId];
    const gk = this.gkOf(D); const gkP = gk ? this.players[gk.id] : null;
    const skill = (taker.attrs.penalties * 1.3 + taker.attrs.composure) / 2.3;
    const gkSkill = gkP ? (gkP.attrs.reflexes + gkP.attrs.oneOnOnes * 0.6 + gkP.attrs.agility * 0.4) / 2 : 8;
    const pGoal = clamp(0.70 + (skill - 11) * 0.022 - (gkSkill - 11) * 0.012, 0.5, 0.92);
    T.stats.shots++; T.stats.xg += 0.76;
    const r = rng.next();
    if (r < pGoal) {
      this.goal(T, D, takerId, undefined, 'pen', 0.76);
    } else if (r < pGoal + (1 - pGoal) * 0.6 && gkP) {
      T.stats.onTarget++; D.stats.saves++;
      this.push('pen_saved', T.side, { p: taker.name, gk: gkP.name }, { playerId: takerId, secondaryId: gkP.id, xg: 0.76 });
      this.addRating(D, gkP.id, 0.9); this.addRating(T, takerId, -0.5);
      if (rng.chance(0.25)) this.shot(T, D, 'rebound', 1.2);
    } else {
      this.push('pen_miss', T.side, { p: taker.name, opp: D.club.name }, { playerId: takerId, xg: 0.76 });
      this.addRating(T, takerId, -0.6);
    }
  }

  private shot(T: TeamState, D: TeamState, kind: 'open' | 'header' | 'setpiece' | 'freekick' | 'rebound', ratio: number, assistIdOverride?: number, takerOverride?: number) {
    const rng = this.rng;
    const gk = this.gkOf(D); const gkP = gk ? this.players[gk.id] : null;
    let shooter: OnPitch;
    let assist: OnPitch | undefined;
    let xg: number;
    let big = false;
    let type: 'open' | 'header' | 'longshot' | 'freekick' | 'rebound' | 'setpiece' = kind === 'open' ? 'open' : kind;
    if (kind === 'freekick') {
      shooter = T.onPitch.find((o) => o.id === takerOverride) ?? this.pickAttacker(T, 'creator');
      xg = 0.055;
    } else if (kind === 'header') {
      shooter = this.pickAttacker(T, 'header');
      xg = 0.10;
      if (assistIdOverride && assistIdOverride !== shooter.id) assist = T.onPitch.find((o) => o.id === assistIdOverride);
    } else if (kind === 'setpiece') {
      shooter = this.pickAttacker(T, 'shooter');
      xg = 0.13;
      if (assistIdOverride && assistIdOverride !== shooter.id) assist = T.onPitch.find((o) => o.id === assistIdOverride);
    } else if (kind === 'rebound') {
      shooter = this.pickAttacker(T, 'shooter'); xg = 0.3; big = true;
    } else {
      // open play: choose chance type
      const longP = 0.22 * (T.tactic.mentality === 'very-attacking' ? 0.8 : 1);
      const bigP = clamp(0.13 * Math.pow(ratio, 1.2) * (T.tactic.counter ? 1.15 : 1), 0.05, 0.35);
      const r = rng.next();
      if (r < longP) { shooter = this.pickAttacker(T, 'longshot'); xg = 0.03; type = 'longshot'; }
      else if (r < longP + bigP) { shooter = this.pickAttacker(T, 'shooter'); xg = 0.33; big = true; }
      else { shooter = this.pickAttacker(T, 'shooter'); xg = 0.075; }
      if (rng.chance(type === 'longshot' ? 0.5 : 0.82)) {
        const cands = T.onPitch.filter((o) => o.id !== shooter.id && o.pos !== 'GK');
        if (cands.length) {
          const w = cands.map((o) => { const a = this.players[o.id].attrs; const y = T.slots[o.slot]?.y ?? 50; return (y >= 45 ? 1.4 : 0.4) * (a.passing + a.vision * 1.2 + a.crossing * 0.5 + a.technique * 0.4); });
          assist = rng.weighted(cands, w);
        }
      }
    }
    const sp = this.players[shooter.id]; const a = sp.attrs;
    // shot quality modifiers
    const finishing = type === 'header' ? (a.heading * 1.3 + a.jumping * 0.4 + a.composure * 0.3) / 2 : type === 'longshot' ? (a.longShots * 1.3 + a.technique * 0.5) / 1.8 : type === 'freekick' ? (a.freeKicks * 1.5 + a.technique * 0.5) / 2 : (a.finishing * 1.3 + a.composure * 0.7 + a.technique * 0.3) / 2.3;
    const fatigueMul = 0.85 + 0.15 * (T.fatigue[shooter.id] ?? 1);
    const gkQ = gkP ? (gkP.attrs.reflexes * 1.2 + gkP.attrs.positioning * 0.8 + gkP.attrs.oneOnOnes * (big ? 1 : 0.4) + gkP.attrs.handling * 0.4 + gkP.attrs.aerialReach * (type === 'header' ? 0.8 : 0.2)) / (big ? 4.2 : 3.4) : 6;
    const defQ = D.def / 5; // ~10-16
    // xG adjusted by finishing/defence
    const shotXg = clamp(xg * (0.7 + finishing / 30) * fatigueMul, 0.01, 0.85);
    T.stats.shots++; T.stats.xg += shotXg * 0.85; if (big) T.stats.bigChances++;
    if (assist) T.stats.passes += 3;

    // outcome branch: blocked / off-target / on-target(save|goal|post)
    const blockP = type === 'longshot' ? 0.32 : type === 'freekick' ? 0.24 : big ? 0.08 : 0.24;
    const offP = type === 'longshot' ? 0.44 : type === 'header' ? 0.47 : type === 'freekick' ? 0.44 : big ? 0.26 : 0.40;
    const accMul = clamp(1 - (finishing - 12) * 0.03, 0.75, 1.25);
    const r = rng.next();
    if (r < blockP * (defQ / 12)) {
      const d = this.pickDefender(D, 'blocker'); D.stats.tackles++; T.stats.blocked++;
      this.push('shot_blocked', T.side, { p: sp.name, d: this.name(d.id) }, { playerId: shooter.id, secondaryId: d.id, xg: shotXg });
      this.addRating(D, d.id, 0.12);
      if (rng.chance(big ? 0.35 : 0.22)) this.corner(T, D);
      return;
    }
    if (r < blockP * (defQ / 12) + offP * accMul) {
      this.push(big ? 'chance_miss' : 'shot_off', T.side, { p: sp.name }, { playerId: shooter.id, xg: shotXg });
      this.addRating(T, shooter.id, big ? -0.35 : -0.05);
      return;
    }
    // on target
    T.stats.onTarget++;
    // goal probability given on target
    const gkFactor = clamp(1 - (gkQ - 12) * 0.045, 0.6, 1.35);
    let pGoal = clamp(shotXg / (1 - offP * accMul - blockP * defQ / 12) * gkFactor * 1.04, 0.05, 0.9);
    if (type === 'freekick') pGoal = clamp(pGoal * 0.9, 0.05, 0.5);
    const r2 = rng.next();
    if (r2 < pGoal) {
      // VAR check on ~8% of goals; 25% of checks overturn
      if (rng.chance(0.08)) {
        this.push('var', T.side, {});
        if (rng.chance(0.28)) { this.push('var_overturn', T.side, { key: 'var_overturn' }); T.stats.offsides++; return; }
      }
      this.goal(T, D, shooter.id, assist?.id, type, shotXg);
      return;
    }
    if (rng.chance(0.06)) {
      this.push('post', T.side, { p: sp.name, gk: gkP?.name, team: T.club.name }, { playerId: shooter.id, xg: shotXg });
      if (rng.chance(0.3)) this.shot(T, D, 'rebound', ratio);
      return;
    }
    // save
    D.stats.saves++;
    const bigSave = big || shotXg > 0.25;
    if (gkP) {
      this.push(bigSave ? 'big_save' : 'save', T.side, { p: sp.name, gk: gkP.name }, { playerId: shooter.id, secondaryId: gkP.id, xg: shotXg });
      this.addRating(D, gkP.id, bigSave ? 0.45 : 0.15);
      this.addRating(T, shooter.id, bigSave ? -0.1 : 0.05);
      if (bigSave && rng.chance(0.3)) this.corner(T, D);
      else if (rng.chance(0.12)) this.shot(T, D, 'rebound', ratio);
    }
  }

  private goal(T: TeamState, D: TeamState, scorerId: number, assistId: number | undefined, type: string, xg: number) {
    T.goals++;
    const sp = this.players[scorerId];
    const gkP = this.gkOf(D) ? this.players[this.gkOf(D)!.id] : null;
    const key = type === 'pen' ? 'pen_goal' : type === 'header' ? 'header_goal' : type === 'longshot' ? 'longshot_goal' : type === 'freekick' ? 'fk_goal' : assistId ? 'goal' : 'goal_no_assist';
    const evType: MatchEvent['type'] = type === 'pen' ? 'pen_goal' : 'goal';
    this.push(evType, T.side, { key, p: sp.name, a: assistId ? this.name(assistId) : undefined, team: T.club.name, gk: gkP?.name ?? 'the keeper' }, { playerId: scorerId, secondaryId: assistId, xg });
    T.scorers.push({ playerId: scorerId, minute: this.minute + (this.added ? this.added / 100 : 0), type });
    this.addRating(T, scorerId, 1.0);
    if (assistId) this.addRating(T, assistId, 0.6);
    if (gkP) this.addRating(D, gkP.id, -0.25);
    for (const o of D.onPitch) if (o.pos === 'CB') this.addRating(D, o.id, -0.12);
    for (const o of T.onPitch) this.addRating(T, o.id, 0.06);
    T.momentum = clamp(T.momentum + 0.5, -1, 1); D.momentum = clamp(D.momentum - 0.3, -1, 1);
  }

  // ───────────────────────── substitutions / tactics ─────────────────────────
  canSub(t: TeamState): boolean { return t.subsUsed < 5 && t.bench.length > 0; }

  substitute(side: Side, outId: number, inId: number, newPos?: Pos): boolean {
    const t = this.team(side);
    if (!this.canSub(t)) return false;
    const outIdx = t.onPitch.findIndex((o) => o.id === outId);
    if (outIdx < 0 || !t.bench.includes(inId)) return false;
    const slotInfo = t.onPitch[outIdx];
    const inP = this.players[inId];
    t.onPitch[outIdx] = { id: inId, pos: newPos ?? (inP.pos === 'GK' ? 'GK' : slotInfo.pos), slot: slotInfo.slot };
    t.bench = t.bench.filter((x) => x !== inId);
    t.subsUsed++;
    if (this.minute !== t.lastSubMinute && !(this.minute === 45 && this.period === 2 && this.added === 0)) t.subWindows++;
    t.lastSubMinute = this.minute;
    t.ratings[inId] = 6.0;
    t.minutes[inId] = 0;
    this.push('sub', side, { team: t.club.name, p: inP.name, a: this.name(outId) }, { playerId: inId, secondaryId: outId });
    this.recompute(t);
    return true;
  }

  setTactic(side: Side, tactic: Tactic) {
    const t = this.team(side);
    const oldF = t.tactic.formation;
    t.tactic = { ...tactic };
    if (tactic.formation !== oldF && FORMATIONS[tactic.formation]) {
      t.slots = FORMATIONS[tactic.formation];
      // remap players to closest slots
      this.remapSlots(t);
    }
    this.push('tactic', side, { team: t.club.name });
    this.recompute(t);
  }

  private remapSlots(t: TeamState) {
    const slots = t.slots;
    const free = slots.map((_, i) => i);
    const assigned: OnPitch[] = [];
    // GK first
    const gk = t.onPitch.find((o) => o.pos === 'GK');
    if (gk) { assigned.push({ ...gk, slot: 0, pos: 'GK' }); free.splice(free.indexOf(0), 1); }
    const rest = t.onPitch.filter((o) => o !== gk);
    for (const o of rest) {
      let bestI = -1, bestV = -1;
      for (const i of free) {
        if (slots[i].pos === 'GK') continue;
        const v = ovrAtPosition(this.players[o.id], slots[i].pos);
        if (v > bestV) { bestV = v; bestI = i; }
      }
      if (bestI >= 0) { assigned.push({ id: o.id, pos: slots[bestI].pos, slot: bestI }); free.splice(free.indexOf(bestI), 1); }
    }
    t.onPitch = assigned;
  }

  private aiReshapeAfterRed(t: TeamState) {
    // remove a forward slot conceptually: shift to more defensive mentality
    if (t.tactic.mentality === 'attacking' || t.tactic.mentality === 'very-attacking') t.tactic = { ...t.tactic, mentality: 'balanced' };
    else t.tactic = { ...t.tactic, mentality: 'defensive' };
  }

  private aiDecisions() {
    for (const t of [this.H, this.A]) {
      if (t.isUser && !this.opts.autoSubs) continue;
      const opp = this.team(other(t.side));
      const diff = t.goals - opp.goals;
      // tactical mentality shifts
      if (this.minute >= 70 && diff < 0 && t.tactic.mentality !== 'very-attacking') {
        if (this.minute >= 80 || this.rng.chance(0.15)) { t.tactic = { ...t.tactic, mentality: this.minute >= 85 ? 'very-attacking' : 'attacking', pressing: 'high', line: 'high' }; this.recompute(t); }
      } else if (this.minute >= 80 && diff > 0 && t.tactic.mentality !== 'defensive' && this.rng.chance(0.3)) {
        t.tactic = { ...t.tactic, mentality: 'defensive', timeWasting: true }; this.recompute(t);
      }
      // substitutions
      if (!this.canSub(t) || t.subWindows >= 3) continue;
      if (this.minute < 46 && !(this.period === 2 && this.minute === 46)) {
        // injuries are handled elsewhere; first-half subs only for injuries
        continue;
      }
      const wantSubs = (this.minute >= 58 && this.rng.chance(0.075)) || (this.minute >= 72 && this.rng.chance(0.16)) || (this.minute === 46 && this.rng.chance(0.28));
      if (!wantSubs) continue;
      const nSubs = this.minute >= 68 && t.subsUsed <= 3 && this.rng.chance(0.65) ? 2 : 1;
      for (let k = 0; k < nSubs; k++) this.aiMakeSub(t, diff);
    }
  }

  private aiMakeSub(t: TeamState, diff: number) {
    if (!this.canSub(t)) return;
    // candidate out: most tired outfield or poor-rated; if losing prefer replacing defender with attacker
    const outfield = t.onPitch.filter((o) => o.pos !== 'GK');
    const scoreOut = (o: OnPitch) => {
      const f = t.fatigue[o.id] ?? 1;
      const y = t.slots[o.slot]?.y ?? 50;
      let s = (1 - f) * 3 + (6.5 - (t.ratings[o.id] ?? 6)) * 0.8 + (t.yellow.has(o.id) ? 0.5 : 0);
      if (diff < 0 && y < 45) s += 0.8;
      if (diff > 0 && y > 70) s += 0.5;
      return s;
    };
    const out = outfield.slice().sort((a, b) => scoreOut(b) - scoreOut(a))[0];
    if (!out) return;
    // candidate in: best bench player for that slot; if losing, prefer attackers
    let bestIn: number | null = null, bestV = -1;
    for (const id of t.bench) {
      const p = this.players[id];
      if (p.pos === 'GK') continue;
      let v = ovrAtPosition(p, out.pos) * (0.85 + 0.15 * (t.fatigue[id] ?? 1));
      if (diff < 0 && (p.pos === 'ST' || p.pos === 'LW' || p.pos === 'RW' || p.pos === 'AM')) v *= 1.12;
      if (diff > 0 && (p.pos === 'CB' || p.pos === 'DM')) v *= 1.08;
      if (v > bestV) { bestV = v; bestIn = id; }
    }
    if (bestIn === null) return;
    const inP = this.players[bestIn];
    const newPos: Pos = diff < 0 && (inP.pos === 'ST' || inP.pos === 'AM' || inP.pos === 'LW' || inP.pos === 'RW') ? inP.pos : ovrAtPosition(inP, out.pos) >= inP.ovr * 0.9 ? out.pos : inP.pos;
    this.substitute(t.side, out.id, bestIn, newPos);
  }

  /** Injury check each minute — called from simulateMinute through a low-probability hook */
  injuryTick() {
    for (const t of [this.H, this.A]) {
      for (const o of t.onPitch) {
        const f = t.fatigue[o.id] ?? 1;
        const p = 0.00018 * (f < 0.4 ? 1.8 : 1);
        if (this.rng.chance(p)) {
          const pl = this.players[o.id];
          this.push('injury', t.side, { p: pl.name, team: t.club.name }, { playerId: o.id });
          this.injured.push({ id: o.id, side: t.side, minute: this.minute });
          if (!t.isUser || this.opts.autoSubs) {
            // AI sub for injury
            if (this.canSub(t)) {
              let best: number | null = null, bv = -1;
              for (const id of t.bench) { const v = ovrAtPosition(this.players[id], o.pos); if ((o.pos === 'GK') === (this.players[id].pos === 'GK') && v > bv) { bv = v; best = id; } }
              if (best !== null) this.substitute(t.side, o.id, best, o.pos);
            } else { t.onPitch = t.onPitch.filter((x) => x.id !== o.id); this.recompute(t); }
          } else {
            // user's injured player can't continue at full ability; mark heavy fatigue — UI prompts sub
            t.fatigue[o.id] = 0.1;
          }
          return;
        }
      }
    }
  }
  injured: { id: number; side: Side; minute: number }[] = [];

  // ───────────────────────── result ─────────────────────────
  result(): MatchResult {
    const H = this.H, A = this.A;
    const tot = this.possession[0] + this.possession[1] || 1;
    H.stats.possession = Math.round(100 * this.possession[0] / tot); A.stats.possession = 100 - H.stats.possession;
    for (const t of [H, A]) { t.stats.passes = Math.round(t.stats.possession * 6 + t.mid * 1.5); t.stats.passAcc = Math.round(clamp(70 + (t.mid - 60) * 0.6, 60, 93)); }
    const ratings: Record<number, number> = {};
    const minutes: Record<number, number> = {};
    for (const t of [H, A]) {
      for (const id of Object.keys(t.ratings).map(Number)) {
        if ((t.minutes[id] ?? 0) <= 0) continue;
        let r = t.ratings[id];
        // participation shaping: short cameos regress to 6.3
        const m = Math.min(t.minutes[id], this.period >= 3 ? 120 : 90);
        if (m < 20) r = 6.3 + (r - 6.3) * (m / 20);
        const p = this.players[id];
        // team result influence
        const diff = t.goals - this.team(other(t.side)).goals;
        r += diff > 0 ? 0.25 : diff < 0 ? -0.2 : 0;
        // clean sheet bonus for defenders/GK
        if (this.team(other(t.side)).goals === 0 && (p.pos === 'GK' || p.pos === 'CB' || p.pos === 'LB' || p.pos === 'RB') && m >= 60) r += 0.4;
        ratings[id] = Math.round(clamp(r + this.rng.float(-0.15, 0.15), 3, 10) * 10) / 10;
        minutes[id] = m;
      }
    }
    // MOTM: highest rating, tie-break winners
    let motm = -1, best = -1;
    for (const id of Object.keys(ratings).map(Number)) if (ratings[id] > best) { best = ratings[id]; motm = id; }
    let winner: number | null = null;
    if (this.opts.knockout) {
      let hg = H.goals, ag = A.goals;
      if (this.opts.aggregate) { hg += this.opts.aggregate[0]; ag += this.opts.aggregate[1]; }
      if (hg > ag) winner = H.club.id; else if (ag > hg) winner = A.club.id;
      else winner = this.pens[0] > this.pens[1] ? H.club.id : A.club.id;
    } else winner = H.goals > A.goals ? H.club.id : A.goals > H.goals ? A.club.id : null;
    const et = this.period >= 3;
    const ft = this.events.find((e) => e.type === 'et_start');
    const ftScore = ft ? (ft.score as [number, number]) : [H.goals, A.goals];
    return {
      fixtureId: this.fixture.id, homeId: H.club.id, awayId: A.club.id, hg: H.goals, ag: A.goals, ftHg: ftScore[0], ftAg: ftScore[1], et,
      pens: this.shootoutIdx > 0 ? [this.pens[0], this.pens[1]] : undefined, winnerId: winner, events: this.events,
      stats: { H: H.stats, A: A.stats }, ratings, minutes, lineups: { H: H.starters, A: A.starters }, benches: { H: H.benchStart, A: A.benchStart },
      motm, attendance: this.attendance, scorers: { H: H.scorers, A: A.scorers },
    };
  }

  /** Run to completion */
  runAll(): MatchResult {
    let guard = 0;
    while (!this.finished && guard++ < 400) this.step();
    return this.result();
  }
}
