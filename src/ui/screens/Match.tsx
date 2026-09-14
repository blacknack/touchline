import React, { useEffect, useRef, useState } from 'react';
import { useGame, useStore } from '../store';
import { Panel, ClubBadge, PosTag, Rating, Seg, Modal } from '../components/common';
import { ScoreHeader, MatchReport, evClass, minuteStr } from '../components/MatchReport';
import { TacticsEditor } from './Tactics';
import { MatchEvent, Pos, Tactic } from '../../engine/types';
import { Side } from '../../engine/match/engine';
import { surname, conditionColor, formatDay, clubAccent } from '../util';
import { Pitch2D, Pitch2DHandle } from '../components/Pitch2D';
import { pickLineup } from '../../engine/tactics';
import { ovrAtPosition } from '../../engine/attributes';

const PAUSE_TYPES = new Set(['goal', 'pen_goal', 'own_goal', 'red', 'second_yellow', 'penalty_awarded', 'pen_miss', 'pen_saved', 'injury', 'var_overturn', 'halftime', 'et_start', 'shootout_start']);
const ICON: Partial<Record<MatchEvent['type'], string>> = { goal: '⚽', pen_goal: '⚽', own_goal: '⚽', pen_miss: '❌', pen_saved: '🧤', yellow: '🟨', second_yellow: '🟥', red: '🟥', sub: '🔁', injury: '🩹', penalty_awarded: '⚠️', var: '📺', var_overturn: '📺', post: '🪵', big_save: '🧤', save: '🧤', shootout_goal: '✅', shootout_miss: '❌', corner: '⛳', freekick: '🎯', chance_miss: '😩', shot_off: '↗', shot_blocked: '🛡', offside: '🚩', foul: '✋', halftime: '⏸', fulltime: '🏁', et_start: '⏱', added_time: '⏱' };

const SHOT_TYPES = new Set(['goal', 'pen_goal', 'shot_off', 'chance_miss', 'post', 'save', 'big_save', 'shot_blocked', 'pen_miss', 'pen_saved']);
const ON_TARGET = new Set(['goal', 'pen_goal', 'save', 'big_save', 'pen_saved']);
/** Match stats as implied by the events shown so far (so the 2D view never runs ahead of the numbers). */
function statsFromEvents(evs: MatchEvent[]) {
  const mk = () => ({ shots: 0, onTarget: 0, xg: 0, corners: 0, fouls: 0, yellows: 0, reds: 0, offsides: 0, pens: 0 });
  const st = { H: mk(), A: mk() };
  evs.forEach((e, i) => {
    if (!e.side) return;
    const t = st[e.side], o = st[e.side === 'H' ? 'A' : 'H'];
    if (SHOT_TYPES.has(e.type)) { t.shots++; t.xg += e.xg ?? 0; }
    if (ON_TARGET.has(e.type)) t.onTarget++;
    if (e.type === 'corner') t.corners++;
    if (e.type === 'foul' || e.type === 'freekick' || e.type === 'penalty_awarded') o.fouls++;
    if (e.type === 'yellow' || e.type === 'second_yellow' || e.type === 'red') { t.yellows += e.type === 'yellow' || e.type === 'second_yellow' ? 1 : 0; t.reds += e.type === 'red' || e.type === 'second_yellow' ? 1 : 0; const prev = evs[i - 1]; if (!prev || !['foul', 'freekick', 'penalty_awarded'].includes(prev.type)) t.fouls++; }
    if (e.type === 'offside' || e.type === 'var_overturn') t.offsides++;
    if (e.type === 'shootout_goal') t.pens++;
  });
  return st;
}

export function Match() {
  const state = useGame();
  const phase = useStore((s) => s.matchPhase);
  const sim = useStore((s) => s.sim);
  const startMatch = useStore((s) => s.startMatch);
  const endMatch = useStore((s) => s.endMatch);
  const finishMatchDay = useStore((s) => s.finishMatchDay);
  const lastResult = useStore((s) => s.lastResult);
  const fid = state.pendingUserFixture;
  const f = fid !== null ? state.fixtures[fid] : null;
  if (!f) return <Panel><div className="empty">No match pending.</div><button className="btn" onClick={() => useStore.setState({ screen: 'home' })}>Home</button></Panel>;
  const mineSide: Side = f.homeId === state.manager.clubId ? 'H' : 'A';

  if (phase === 'pre') {
    const opp = state.clubs[mineSide === 'H' ? f.awayId : f.homeId];
    const oppXI = pickLineup(opp, state.players, f.compId);
    return (
      <div className="col gap12">
        <Panel><ScoreHeader f={f} r={null} />
          <div className="row center gap12 mt8 wrap">
            <button className="btn primary lg" onClick={() => startMatch()}>Kick off ▸</button>
            <button className="btn lg" onClick={() => { startMatch(true); setTimeout(() => endMatch(), 30); }}>Instant result</button>
            <label className="row gap4 small muted"><input type="checkbox" defaultChecked={state.options.autoSubs} onChange={(e) => { state.options.autoSubs = e.target.checked; }} /> Assistant makes substitutions</label>
          </div>
        </Panel>
        <div className="grid" style={{ gridTemplateColumns: '3fr 1fr' }}>
          <div><h3 className="mb8">Your line-up</h3><TacticsEditor inMatch /></div>
          <Panel title={`${opp.short} expected XI`} tight>
            <div className="lineup-list" style={{ padding: '4px 12px' }}>
              {oppXI.starters.map((id, i) => { if (id === null) return null; const p = state.players[id]; return <div key={id} className="p"><span className="num">{p.number}</span><PosTag pos={p.pos} /><span className="grow">{surname(p.name)}</span><span className="mono muted">{p.ovr}</span></div>; })}
            </div>
            <div className="tiny muted" style={{ padding: '6px 12px' }}>{opp.tactic.formation} · rep {opp.reputation} · form {state.competitions[opp.leagueId ?? '']?.standings?.find((s) => s.clubId === opp.id)?.form.join('') || '-'}</div>
          </Panel>
        </div>
      </div>
    );
  }
  if (phase === 'post' && lastResult) {
    return (
      <div className="col gap12">
        <MatchReport f={f} />
        <div className="row center"><button className="btn primary lg" onClick={finishMatchDay}>Continue ▸</button></div>
      </div>
    );
  }
  if (!sim) return null;
  return <Live />;
}

function colorDist(a: string, b: string): number {
  const h = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const [r1, g1, b1] = h(a), [r2, g2, b2] = h(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}
function hue(c: string): number | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c); if (!m) return null;
  const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b); if (max - min < 0.15) return null; // greys/white/black have no hue
  const d = max - min; let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}
function sameHue(a: string, b: string): boolean { const ha = hue(a), hb = hue(b); if (ha === null || hb === null) return false; const d = Math.abs(ha - hb); return Math.min(d, 360 - d) < 28; }
function kitColors(h: { colors: [string, string] }, a: { colors: [string, string] }): [string, string] {
  const hc = clubAccent(h as any);
  let ac = clubAccent(a as any);
  // same-hue kits (two blues, two reds) are hard to tell apart from above: be strict about clashes
  if (colorDist(hc, ac) < 170 || sameHue(hc, ac)) ac = a.colors[1];
  if (colorDist(hc, ac) < 170 || sameHue(hc, ac)) ac = colorDist(hc, '#f4f4f4') < 120 ? '#1c1c1c' : '#f4f4f4';
  return [hc, ac];
}

const KEY_TYPES = new Set(['goal', 'pen_goal', 'own_goal', 'pen_miss', 'pen_saved', 'red', 'second_yellow', 'yellow', 'sub', 'injury', 'var_overturn', 'penalty_awarded', 'post', 'big_save']);

function Live() {
  const state = useGame();
  const sim = useStore((s) => s.sim)!;
  const endMatch = useStore((s) => s.endMatch);
  const [, force] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<number>(state.options.matchSpeed || 3);
  const [view, setView] = useState<'text' | '2d'>((state.options as any).matchView ?? 'text');
  const [events, setEvents] = useState<MatchEvent[]>(sim.events.slice());
  const [vizMinute, setVizMinute] = useState<string>(`${sim.minute}'`);
  const [done2d, setDone2d] = useState(false);
  const viewRef = useRef(view); viewRef.current = view;
  const [flash, setFlash] = useState<MatchEvent | null>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [tacOpen, setTacOpen] = useState(false);
  const [showNames, setShowNames] = useState(false);
  const [breakType, setBreakType] = useState<'halftime' | 'et_start' | 'et_half' | 'et_end' | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const pitchRef = useRef<Pitch2DHandle>(null);
  const mineSide: Side = sim.fixture.homeId === state.manager.clubId ? 'H' : 'A';
  const me = sim.team(mineSide);
  const pauseUntil = useRef(0);
  const h = state.clubs[sim.fixture.homeId], a = state.clubs[sim.fixture.awayId];
  const [hc, ac] = kitColors(h, a);

  // react to an event at the moment it is shown (immediately in text mode, when played out in 2D)
  const reactTo = (e: MatchEvent) => {
    if (PAUSE_TYPES.has(e.type)) {
      if (['goal', 'pen_goal', 'own_goal', 'red', 'second_yellow', 'penalty_awarded', 'injury'].includes(e.type)) { setFlash(e); setTimeout(() => setFlash(null), 2200); }
      if (viewRef.current !== '2d') pauseUntil.current = Date.now() + (speed >= 4 ? 300 : 1800);
    }
    if (e.type === 'halftime' || e.type === 'et_start' || e.type === 'et_half' || e.type === 'et_end') { setPlaying(false); setBreakType(e.type); }
    if (e.type === 'injury' && e.side === mineSide && !sim.opts.autoSubs) { setPlaying(false); setSubOpen(true); }
    if (e.type === 'fulltime' || e.type === 'shootout_end') { setDone2d(true); setPlaying(false); }
  };
  const onCommit = (e: MatchEvent) => { setEvents((ev) => (ev.includes(e) ? ev : [...ev, e])); reactTo(e); };

  useEffect(() => {
    if (!playing || (sim.finished && view !== '2d')) return;
    const ms = view === '2d' ? 40 : speed === 1 ? 900 : speed === 2 ? 450 : speed === 3 ? 200 : 60;
    const t = setInterval(() => {
      if (Date.now() < pauseUntil.current) return;
      if (view === '2d' && pitchRef.current?.busy()) return;
      if (sim.finished) { setPlaying(false); return; }
      const snap = sim.step();
      if (view === '2d' && pitchRef.current) pitchRef.current.push(snap.events, snap.attacking, sim.inShootout ? 'PENS' : sim.added ? `${sim.minute}+${sim.added}'` : `${sim.minute}'`);
      else if (snap.events.length) { setEvents((ev) => [...ev, ...snap.events]); for (const e of snap.events) reactTo(e); }
      if (sim.finished && view !== '2d') setPlaying(false);
      force((x) => x + 1);
    }, ms);
    return () => clearInterval(t);
  }, [playing, speed, sim, mineSide, view, state.players]);

  // switching from the 2D view to text: show whatever the pitch had not played out yet
  useEffect(() => { if (view !== '2d') setEvents((ev) => { const set = new Set(ev); const missing = sim.events.filter((e) => !set.has(e)); return missing.length ? [...ev, ...missing] : ev; }); }, [view, sim]);

  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [events.length]);

  const live2d = view === '2d';
  const clock = live2d ? vizMinute : sim.inShootout ? 'PENS' : sim.added ? `${sim.minute}+${sim.added}'` : `${sim.minute}'`;
  const tot = sim.possession[0] + sim.possession[1] || 1;
  const possH = Math.round(100 * sim.possession[0] / tot);
  const mom = sim.H.momentum - sim.A.momentum; // -1..1 positive = home
  // everything on the scoreboard is derived from the events already shown, so the 2D view never spoils itself
  const goalsShown = events.filter((e) => e.type === 'goal' || e.type === 'pen_goal' || e.type === 'own_goal');
  const score: [number, number] = [goalsShown.filter((e) => e.side === 'H').length, goalsShown.filter((e) => e.side === 'A').length];
  const scorers = (side: Side) => goalsShown.filter((e) => e.side === side && e.playerId !== undefined).map((e) => `${surname(state.players[e.playerId!].name)} ${e.minute}${e.added ? '+' + e.added : ''}'${e.type === 'pen_goal' ? ' (p)' : ''}`).join(', ');
  const est = statsFromEvents(events);
  const stat = (side: Side, k: 'shots' | 'onTarget' | 'xg' | 'corners' | 'fouls' | 'yellows' | 'reds' | 'offsides') => (live2d ? est[side][k] : sim.team(side).stats[k]);
  const pensShown: [number, number] = live2d ? [est.H.pens, est.A.pens] : [sim.pens[0], sim.pens[1]];
  const shootoutShown = live2d ? events.some((e) => e.type === 'shootout_start') : sim.shootoutIdx > 0;
  const etShown = live2d ? events.some((e) => e.type === 'et_start') && !events.some((e) => e.type === 'shootout_start') : sim.period >= 3 && !sim.inShootout;
  const agg = sim.opts.aggregate;
  const keyMoments = events.filter((e) => KEY_TYPES.has(e.type));
  const canResume = !sim.finished;
  const finishedShown = sim.finished && (!live2d || done2d);

  const controls = (
    <div className="row center gap4 mt16 wrap">
      {!finishedShown && <>
        <button className="btn" onClick={() => setPlaying(!playing)}>{playing ? '⏸ Pause' : '▶ Play'}</button>
        <Seg options={[{ id: '1', label: '1×' }, { id: '2', label: '2×' }, { id: '3', label: '4×' }, { id: '4', label: '8×' }]} value={String(speed) as any} onChange={(v) => { setSpeed(Number(v)); state.options.matchSpeed = Number(v); }} />
        <Seg options={[{ id: 'text', label: '📝 Text' }, { id: '2d', label: '🛰 2D pitch' }]} value={view} onChange={(v) => { setView(v); (state.options as any).matchView = v; }} />
        <button className="btn" onClick={() => { setPlaying(false); setSubOpen(true); }} disabled={!sim.canSub(me)}>🔁 Subs ({5 - me.subsUsed} left)</button>
        <button className="btn" onClick={() => { setPlaying(false); setTacOpen(true); }}>📋 Tactics</button>
        <button className="btn ghost" onClick={() => { setPlaying(false); endMatch(); }}>⏭ Skip to end</button>
      </>}
      {finishedShown && <button className="btn primary lg" onClick={endMatch}>Full time — see report ▸</button>}
    </div>
  );

  return (
    <div className="col gap12">
      {flash && view !== '2d' && <div className="event-flash">{ICON[flash.type]} {flash.text}</div>}
      <Panel>
        <div className="small muted" style={{ textAlign: 'center' }}>{state.competitions[sim.fixture.compId]?.name} · {sim.fixture.stageName} · {formatDay(sim.fixture.day)}{agg ? ` · 1st leg ${agg[1]}–${agg[0]} (agg. ${score[0] + agg[0]}–${score[1] + agg[1]})` : ''}</div>
        <div className="scoreboard">
          <div className="team"><ClubBadge club={h} size="xl" /><div className="n">{h.name}</div></div>
          <div className="col" style={{ alignItems: 'center', gap: 2 }}>
            <div className="score">{score[0]} – {score[1]}</div>
            <div className="clock">{clock}{etShown ? ' ET' : ''}</div>
            {shootoutShown && <div className="tiny muted">Pens {pensShown[0]}–{pensShown[1]}</div>}
          </div>
          <div className="team"><ClubBadge club={a} size="xl" /><div className="n">{a.name}</div></div>
        </div>
        <div className="row" style={{ padding: '0 16px', justifyContent: 'space-between' }}><div className="scorers" style={{ flex: 1, textAlign: 'left' }}>{scorers('H')}</div><div className="scorers" style={{ flex: 1, textAlign: 'right' }}>{scorers('A')}</div></div>
        <div className="row gap12 mt8" style={{ padding: '0 16px', alignItems: 'center' }}>
          <span className="tiny muted" style={{ width: 36 }}>{possH}%</span>
          <div className="momentum grow">
            <i style={{ left: '50%', width: `${Math.abs(mom) * 50}%`, transform: mom > 0 ? 'translateX(-100%)' : undefined, background: mom > 0 ? hc : ac, transition: 'width 0.6s ease' }} />
          </div>
          <span className="tiny muted" style={{ width: 36, textAlign: 'right' }}>{100 - possH}%</span>
        </div>
        {keyMoments.length > 0 && (
          <div className="key-strip">
            {keyMoments.slice(-14).map((e, i) => <span key={i} className={`km ${evClass(e)}`} title={e.text}><b>{minuteStr(e)}</b> {ICON[e.type]} {e.playerId !== undefined && state.players[e.playerId] ? surname(state.players[e.playerId].name) : ''}</span>)}
          </div>
        )}
        {controls}
      </Panel>
      {view === '2d' && (
        <Panel tight>
          <div style={{ padding: 8 }}>
            <Pitch2D ref={pitchRef} sim={sim} players={state.players} speed={speed} running={playing} showNames={showNames} homeColor={hc} awayColor={ac} homeShort={h.short} awayShort={a.short} onEvent={onCommit} onMinute={setVizMinute} />
            <div className="row gap12 mt8" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="tiny muted">Live 2D · {speed === 1 ? 'real-time feel' : speed === 2 ? 'brisk' : speed === 3 ? 'fast' : 'very fast'} — every pass, run and set piece is played out</span>
              <label className="tiny muted row gap4" style={{ cursor: 'pointer' }}><input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /> Player names</label>
            </div>
          </div>
          <div className="feed" style={{ maxHeight: 150 }} ref={feedRef}>
            {events.slice(-8).map((e, i) => <div key={i} className={`ev ${evClass(e)}`}><span className="m">{minuteStr(e)}</span><span style={{ width: 36 }} className="tiny muted">{e.side ? (e.side === 'H' ? h.short : a.short) : ''}</span><span>{ICON[e.type] ?? ''} {e.text}</span></div>)}
          </div>
        </Panel>
      )}
      <div className="grid" style={{ gridTemplateColumns: view === '2d' ? '1fr 1fr' : '1.3fr 1fr' }}>
        {view !== '2d' && (
          <Panel title="Commentary" tight>
            <div className="feed" ref={feedRef} style={{ maxHeight: 520 }}>
              {events.map((e, i) => <div key={i} className={`ev ${evClass(e)}`}><span className="m">{minuteStr(e)}</span><span style={{ width: 36 }} className="tiny muted">{e.side ? (e.side === 'H' ? h.short : a.short) : ''}</span><span>{ICON[e.type] ?? ''} {e.text}</span></div>)}
            </div>
          </Panel>
        )}
        <Panel title="Match stats" tight>
          <table className="tbl"><thead><tr><th className="num">{h.short}</th><th></th><th>{a.short}</th></tr></thead><tbody>
            {([['Shots', 'shots'], ['On target', 'onTarget'], ['xG', 'xg'], ['Corners', 'corners'], ['Fouls', 'fouls'], ['Yellows', 'yellows'], ['Reds', 'reds'], ['Offsides', 'offsides']] as [string, 'shots' | 'onTarget' | 'xg' | 'corners' | 'fouls' | 'yellows' | 'reds' | 'offsides'][]).map(([l, k]) => <tr key={k}><td className="num">{k === 'xg' ? stat('H', 'xg').toFixed(2) : stat('H', k)}</td><td className="c muted small">{l}</td><td className="num" style={{ textAlign: 'left' }}>{k === 'xg' ? stat('A', 'xg').toFixed(2) : stat('A', k)}</td></tr>)}
          </tbody></table>
        </Panel>
        <Panel title={`${state.clubs[me.club.id].short} on the pitch`} tight>
          <div className="lineup-list" style={{ padding: '4px 12px' }}>
            {me.onPitch.map((o) => { const p = state.players[o.id]; const fat = me.fatigue[o.id] ?? 1; return (
              <div key={o.id} className="p"><span className="num">{p.number}</span><PosTag pos={o.pos} /><span className="grow">{surname(p.name)}{events.some((e) => (e.type === 'yellow' || e.type === 'second_yellow') && e.playerId === o.id) ? ' 🟨' : ''}{goalsShown.some((e) => e.playerId === o.id) ? ' ⚽' : ''}</span><span className="tiny" style={{ color: conditionColor(fat * 100) }}>{Math.round(fat * 100)}%</span><Rating v={me.ratings[o.id] ?? 6} /></div>); })}
          </div>
        </Panel>
      </div>
      {subOpen && <SubModal onClose={() => { setSubOpen(false); if (canResume && !breakType) setPlaying(true); }} side={mineSide} />}
      {tacOpen && <TacticModal onClose={() => { setTacOpen(false); if (canResume && !breakType) setPlaying(true); }} side={mineSide} />}
      {breakType && !subOpen && !tacOpen && (
        <Modal title={breakType === 'halftime' ? `Half-time · ${h.short} ${score[0]}–${score[1]} ${a.short}` : breakType === 'et_start' ? 'Full-time — extra time to come' : breakType === 'et_half' ? 'Half-time in extra time' : 'Penalty shoot-out'} onClose={() => { setBreakType(null); setPlaying(true); }}>
          <div className="row gap12 wrap mb16" style={{ justifyContent: 'center' }}>
            <div className="stat-tile"><div className="v">{stat('H', 'shots')}–{stat('A', 'shots')}</div><div className="l">Shots</div></div>
            <div className="stat-tile"><div className="v">{stat('H', 'xg').toFixed(1)}–{stat('A', 'xg').toFixed(1)}</div><div className="l">xG</div></div>
            <div className="stat-tile"><div className="v">{possH}–{100 - possH}</div><div className="l">Possession</div></div>
          </div>
          <div className="small muted mb16">{breakType === 'halftime' ? 'Time to make changes: substitutions and tactical tweaks made now take effect from the restart.' : breakType === 'et_end' ? 'The shoot-out order is based on your best penalty takers still on the pitch.' : 'Legs are tiring — fresh players will make a difference.'}</div>
          <div className="row gap4 wrap">
            <button className="btn" onClick={() => setSubOpen(true)} disabled={!sim.canSub(me)}>🔁 Substitutions</button>
            <button className="btn" onClick={() => setTacOpen(true)}>📋 Tactics</button>
            <button className="btn primary" onClick={() => { setBreakType(null); setPlaying(true); }}>{breakType === 'halftime' ? 'Start second half ▸' : breakType === 'et_end' ? 'Start the shoot-out ▸' : 'Restart ▸'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SubModal({ onClose, side }: { onClose: () => void; side: Side }) {
  const state = useGame();
  const sim = useStore((s) => s.sim)!;
  const t = sim.team(side);
  const [out, setOut] = useState<number | null>(null);
  const [inn, setInn] = useState<number | null>(null);
  const [pos, setPos] = useState<Pos | ''>('');
  const injured = sim.injured.filter((x) => x.side === side && t.onPitch.some((o) => o.id === x.id)).map((x) => x.id);
  const outSlot = out !== null ? t.onPitch.find((o) => o.id === out) : null;
  const doSub = () => { if (out === null || inn === null) return; const ok = sim.substitute(side, out, inn, (pos || outSlot?.pos) as Pos | undefined); if (ok) { setOut(null); setInn(null); setPos(''); } if (!sim.canSub(t)) onClose(); };
  return (
    <Modal title={`Substitution (${5 - t.subsUsed} remaining, ${3 - t.subWindows} windows)`} onClose={onClose} width={720}>
      {injured.length > 0 && <div className="red small mb8">🩹 {injured.map((id) => state.players[id].name).join(', ')} injured — replace now.</div>}
      <div className="grid grid2">
        <div><div className="tiny dim bold mb8">OFF</div><div className="lineup-list">{t.onPitch.filter((o) => o.pos !== 'GK' || true).map((o) => { const p = state.players[o.id]; return <div key={o.id} className="p clickable" style={{ background: out === o.id ? '#243040' : undefined }} onClick={() => setOut(o.id)}><span className="num">{p.number}</span><PosTag pos={o.pos} /><span className="grow">{surname(p.name)}{injured.includes(o.id) ? ' 🩹' : ''}</span><span className="tiny" style={{ color: conditionColor((t.fatigue[o.id] ?? 1) * 100) }}>{Math.round((t.fatigue[o.id] ?? 1) * 100)}%</span><Rating v={t.ratings[o.id] ?? 6} /></div>; })}</div></div>
        <div><div className="tiny dim bold mb8">ON</div><div className="lineup-list">{t.bench.map((id) => { const p = state.players[id]; return <div key={id} className="p clickable" style={{ background: inn === id ? '#243040' : undefined }} onClick={() => setInn(id)}><span className="num">{p.number}</span><PosTag pos={p.pos} /><span className="grow">{surname(p.name)}</span>{outSlot && <span className="tiny muted">{ovrAtPosition(p, outSlot.pos)} at {outSlot.pos}</span>}<span className="mono muted">{p.ovr}</span></div>; })}</div></div>
      </div>
      <div className="row gap4 mt16 wrap">
        <label className="field">Play as<select value={pos} onChange={(e) => setPos(e.target.value as Pos | '')}><option value="">Same slot ({outSlot?.pos ?? '-'})</option>{['CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'].map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        <button className="btn primary" disabled={out === null || inn === null} onClick={doSub}>Make substitution</button>
        <button className="btn ghost" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

function TacticModal({ onClose, side }: { onClose: () => void; side: Side }) {
  const state = useGame();
  const sim = useStore((s) => s.sim)!;
  const setTactic = useStore((s) => s.setTactic);
  const t = sim.team(side).tactic;
  const upd = (patch: Partial<Tactic>) => setTactic({ ...t, ...patch });
  return (
    <Modal title="In-match tactics" onClose={onClose}>
      <div className="col gap12">
        <div className="row between wrap"><span className="small muted">Mentality</span><Seg options={[{ id: 'very-defensive', label: 'V.Def' }, { id: 'defensive', label: 'Def' }, { id: 'balanced', label: 'Bal' }, { id: 'attacking', label: 'Att' }, { id: 'very-attacking', label: 'V.Att' }]} value={t.mentality} onChange={(v) => upd({ mentality: v })} /></div>
        <div className="row between wrap"><span className="small muted">Pressing</span><Seg options={[{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Med' }, { id: 'high', label: 'High' }]} value={t.pressing} onChange={(v) => upd({ pressing: v })} /></div>
        <div className="row between wrap"><span className="small muted">Line</span><Seg options={[{ id: 'deep', label: 'Deep' }, { id: 'normal', label: 'Normal' }, { id: 'high', label: 'High' }]} value={t.line} onChange={(v) => upd({ line: v })} /></div>
        <div className="row between wrap"><span className="small muted">Tempo</span><Seg options={[{ id: 'slow', label: 'Slow' }, { id: 'normal', label: 'Normal' }, { id: 'fast', label: 'Fast' }]} value={t.tempo} onChange={(v) => upd({ tempo: v })} /></div>
        <div className="row between wrap"><span className="small muted">Formation</span><select value={t.formation} onChange={(e) => upd({ formation: e.target.value })}>{['4-3-3', '4-2-3-1', '4-4-2', '4-4-1-1', '4-1-4-1', '3-5-2', '3-4-3', '3-4-2-1', '4-3-1-2', '5-3-2', '5-4-1', '4-2-2-2'].map((f) => <option key={f}>{f}</option>)}</select></div>
        <div className="row gap12"><label className="row gap4 small"><input type="checkbox" checked={t.counter} onChange={(e) => upd({ counter: e.target.checked })} /> Counter</label><label className="row gap4 small"><input type="checkbox" checked={t.timeWasting} onChange={(e) => upd({ timeWasting: e.target.checked })} /> Time-wasting</label></div>
        <button className="btn primary" onClick={onClose}>Back to the match</button>
      </div>
      {void state}
    </Modal>
  );
}
