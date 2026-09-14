import React, { useState } from 'react';
import { Fixture, MatchEvent, MatchResult } from '../../engine/types';
import { useGame, useStore } from '../store';
import { ClubBadge, Panel, PosTag, Rating, Tabs } from '../components/common';
import { formatDay, surname } from '../util';
import { ovrAtPosition } from '../../engine/attributes';
import { pickLineup, FORMATIONS } from '../../engine/tactics';

const ICON: Partial<Record<MatchEvent['type'], string>> = { goal: '⚽', pen_goal: '⚽(P)', own_goal: '⚽(OG)', pen_miss: '❌P', pen_saved: '🧤P', yellow: '🟨', second_yellow: '🟨🟥', red: '🟥', sub: '🔁', injury: '🩹', penalty_awarded: '⚠️', var: '📺', var_overturn: '📺❌', post: '🪵', big_save: '🧤', save: '🧤', shootout_goal: '✅', shootout_miss: '❌', corner: '⛳', freekick: '🎯', et_start: '⏱', halftime: '⏸', fulltime: '🏁' };

export function evClass(e: MatchEvent) { return e.type === 'goal' || e.type === 'pen_goal' || e.type === 'own_goal' ? 'goal' : e.type === 'red' || e.type === 'second_yellow' ? 'red' : e.type === 'yellow' ? 'card' : ['sub', 'injury', 'penalty_awarded', 'pen_miss', 'pen_saved', 'var_overturn', 'shootout_goal', 'shootout_miss'].includes(e.type) ? 'key' : ''; }
export const minuteStr = (e: { minute: number; added: number }) => (e.added ? `${e.minute}+${e.added}'` : `${e.minute}'`);

export function ScoreHeader({ f, r }: { f: Fixture; r: MatchResult | null }) {
  const state = useGame();
  const h = state.clubs[f.homeId], a = state.clubs[f.awayId];
  const comp = state.competitions[f.compId];
  const scorers = (side: 'H' | 'A') => (r ? r.scorers[side].map((s) => `${surname(state.players[s.playerId]?.name ?? '?')} ${Math.floor(s.minute)}'${s.type === 'pen' ? ' (p)' : ''}`).join(', ') : '');
  return (
    <div>
      <div className="small muted" style={{ textAlign: 'center' }}>{comp?.name}{f.stageName ? ` · ${f.stageName}` : ''} · {formatDay(f.day, { weekday: true })}{f.neutral ? ' · neutral venue' : ` · ${h.stadium}`}{r ? ` · att. ${r.attendance.toLocaleString()}` : ''}</div>
      <div className="scoreboard">
        <div className="team"><ClubBadge club={h} size="xl" onClick={() => useStore.getState().openClub(h.id)} /><div className="n">{h.name}</div></div>
        <div className="col" style={{ alignItems: 'center', gap: 2 }}>
          <div className="score">{r ? `${r.hg} – ${r.ag}` : 'v'}</div>
          {r && (r.et || r.pens) && <div className="tiny muted">{r.pens ? `${r.pens[0]}–${r.pens[1]} on penalties` : 'after extra time'}{r.et ? ` (90': ${r.ftHg}–${r.ftAg})` : ''}</div>}
        </div>
        <div className="team"><ClubBadge club={a} size="xl" onClick={() => useStore.getState().openClub(a.id)} /><div className="n">{a.name}</div></div>
      </div>
      {r && <div className="row" style={{ justifyContent: 'space-between', padding: '0 16px' }}><div className="scorers" style={{ flex: 1, textAlign: 'left' }}>{scorers('H')}</div><div className="scorers" style={{ flex: 1, textAlign: 'right' }}>{scorers('A')}</div></div>}
    </div>
  );
}

export function MatchReport({ f }: { f: Fixture }) {
  const state = useGame();
  const r = f.result;
  const [tab, setTab] = useState<'events' | 'stats' | 'lineups'>('events');
  if (!r) return <Panel><ScoreHeader f={f} r={null} /><div className="empty">Not played yet.</div></Panel>;
  const h = state.clubs[f.homeId], a = state.clubs[f.awayId];
  const keyEvents = r.events.filter((e) => ['goal', 'pen_goal', 'own_goal', 'pen_miss', 'pen_saved', 'yellow', 'second_yellow', 'red', 'sub', 'injury', 'var_overturn', 'shootout_goal', 'shootout_miss', 'et_start', 'halftime', 'fulltime'].includes(e.type));
  const statRow = (label: string, hv: number | string, av: number | string) => <tr><td className="num">{hv}</td><td className="c muted small">{label}</td><td className="num" style={{ textAlign: 'left' }}>{av}</td></tr>;
  const lineupCol = (side: 'H' | 'A') => {
    const ids = [...r.lineups[side], ...r.benches[side].filter((id) => (r.minutes[id] ?? 0) > 0)];
    return ids.map((id) => { const p = state.players[id]; if (!p) return null; const rating = r.ratings[id]; const mins = r.minutes[id] ?? 0; return (
      <div key={id} className="p clickable" onClick={() => useStore.getState().openPlayer(id)}><span className="num">{p.number}</span><PosTag pos={p.pos} /><span className="grow">{p.name}{r.motm === id ? ' ⭐' : ''}</span><span className="tiny dim">{mins}'</span>{rating !== undefined && <Rating v={rating} />}</div>
    ); });
  };
  return (
    <Panel>
      <ScoreHeader f={f} r={r} />
      <Tabs tabs={[{ id: 'events', label: 'Events' }, { id: 'stats', label: 'Stats' }, { id: 'lineups', label: 'Line-ups & ratings' }]} value={tab} onChange={setTab} />
      {tab === 'events' && <div className="feed">{keyEvents.map((e, i) => <div key={i} className={`ev ${evClass(e)}`}><span className="m">{minuteStr(e)}</span><span style={{ width: 40 }}>{e.side ? (e.side === 'H' ? h.short : a.short) : ''}</span><span>{ICON[e.type] ?? ''} {e.text}</span></div>)}</div>}
      {tab === 'stats' && (
        <table className="tbl" style={{ maxWidth: 520, margin: '0 auto' }}>
          <thead><tr><th className="num">{h.short}</th><th></th><th>{a.short}</th></tr></thead>
          <tbody>
            {statRow('Possession', `${r.stats.H.possession}%`, `${r.stats.A.possession}%`)}
            {statRow('Shots', r.stats.H.shots, r.stats.A.shots)}
            {statRow('On target', r.stats.H.onTarget, r.stats.A.onTarget)}
            {statRow('xG', r.stats.H.xg.toFixed(2), r.stats.A.xg.toFixed(2))}
            {statRow('Big chances', r.stats.H.bigChances, r.stats.A.bigChances)}
            {statRow('Corners', r.stats.H.corners, r.stats.A.corners)}
            {statRow('Fouls', r.stats.H.fouls, r.stats.A.fouls)}
            {statRow('Offsides', r.stats.H.offsides, r.stats.A.offsides)}
            {statRow('Yellow / red', `${r.stats.H.yellows} / ${r.stats.H.reds}`, `${r.stats.A.yellows} / ${r.stats.A.reds}`)}
            {statRow('Saves', r.stats.H.saves, r.stats.A.saves)}
            {statRow('Passes (acc.)', `${r.stats.H.passes} (${r.stats.H.passAcc}%)`, `${r.stats.A.passes} (${r.stats.A.passAcc}%)`)}
          </tbody>
        </table>
      )}
      {tab === 'lineups' && (
        <div className="grid grid2">
          <div><div className="bold mb8">{h.name}</div><div className="lineup-list">{lineupCol('H')}</div></div>
          <div><div className="bold mb8">{a.name}</div><div className="lineup-list">{lineupCol('A')}</div></div>
        </div>
      )}
      {r.motm && state.players[r.motm] && <div className="small muted mt8" style={{ textAlign: 'center' }}>⭐ Man of the match: <b>{state.players[r.motm].name}</b> ({r.ratings[r.motm]?.toFixed(1)})</div>}
    </Panel>
  );
}

export function FixturePreview({ f }: { f: Fixture }) {
  const state = useGame();
  const h = state.clubs[f.homeId], a = state.clubs[f.awayId];
  const played = Object.values(state.fixtures).filter((x) => x.played && x.result);
  const h2h = played.filter((x) => (x.homeId === h.id && x.awayId === a.id) || (x.homeId === a.id && x.awayId === h.id)).sort((x, y) => y.day - x.day);
  const h2hRec = { hw: 0, d: 0, aw: 0 };
  for (const x of h2h) { const w = x.result!.winnerId; if (w === h.id) h2hRec.hw++; else if (w === a.id) h2hRec.aw++; else h2hRec.d++; }
  const strength = (cid: number) => { const c = state.clubs[cid]; const lu = pickLineup(c, state.players, f.compId); const slots = FORMATIONS[c.tactic.formation] ?? FORMATIONS['4-3-3']; let sum = 0, n = 0; lu.starters.forEach((id, i) => { if (id !== null) { sum += ovrAtPosition(state.players[id], slots[i].pos); n++; } }); return { lu, v: n ? sum / n : 0, slots }; };
  const sh = strength(h.id), sa = strength(a.id);
  const homeAdv = f.neutral ? 0 : 2;
  const pHome = 1 / (1 + Math.exp(-((sh.v + homeAdv) - sa.v) / 4));
  const col = (cid: number, st: { lu: ReturnType<typeof pickLineup>; v: number; slots: { pos: string }[] }) => {
    const c = state.clubs[cid];
    const league = state.competitions[c.leagueId ?? ''];
    const row = league?.standings?.find((s) => s.clubId === cid);
    const pos = league?.standings ? league.standings.slice().sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga)).findIndex((s) => s.clubId === cid) + 1 : 0;
    const last5 = played.filter((x) => x.homeId === cid || x.awayId === cid).sort((x, y) => y.day - x.day).slice(0, 5).reverse();
    const unavailable = c.players.map((id) => state.players[id]).filter((p) => p && (p.injury || (p.suspension[f.compId] ?? 0) > 0));
    return (
      <div className="col gap12">
        <div className="bold">{c.name} <span className="muted small">({c.tactic.formation}, XI {st.v.toFixed(1)})</span></div>
        <div className="kv small">
          <span className="k">League</span><span>{league && pos ? `${pos}${['st', 'nd', 'rd'][pos - 1] ?? 'th'} in ${league.short}` : '–'}{row ? ` · ${row.w}W ${row.d}D ${row.l}L` : ''}</span>
          <span className="k">Last five</span><span className="row gap4 wrap">{last5.map((x) => { const home = x.homeId === cid; const gf = home ? x.result!.hg : x.result!.ag, ga = home ? x.result!.ag : x.result!.hg; const opp = state.clubs[home ? x.awayId : x.homeId]; return <span key={x.id} className="pill" style={{ background: gf > ga ? '#1f3a2a' : gf < ga ? '#33191b' : '#2a2f3a', color: gf > ga ? 'var(--green)' : gf < ga ? 'var(--red)' : 'var(--muted)' }}>{gf}–{ga} {opp.short}</span>; })}{last5.length === 0 && <span className="dim">no games yet</span>}</span>
          <span className="k">Unavailable</span><span>{unavailable.length ? unavailable.map((p) => `${surname(p.name)} (${p.injury ? '🩹' : '🟥'})`).join(', ') : 'full squad'}</span>
        </div>
        <div>
          <div className="tiny dim bold mb8" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Probable XI</div>
          <div className="lineup-list">{st.lu.starters.map((id, i) => { if (id === null) return null; const p = state.players[id]; return <div key={id} className="p clickable" onClick={() => useStore.getState().openPlayer(id)}><span className="num">{p.number}</span><PosTag pos={st.slots[i].pos as any} /><span className="grow">{surname(p.name)}</span><span className="mono muted small">{ovrAtPosition(p, st.slots[i].pos as any)}</span></div>; })}</div>
        </div>
      </div>
    );
  };
  return (
    <Panel>
      <ScoreHeader f={f} r={null} />
      <div style={{ padding: '0 16px' }}>
        <div className="row between tiny muted"><span>{h.short} {Math.round(pHome * 100)}%</span><span>edge (form & XI strength)</span><span>{a.short} {Math.round((1 - pHome) * 100)}%</span></div>
        <div className="momentum" style={{ marginTop: 4 }}><i style={{ left: 0, width: `${pHome * 100}%`, background: h.colors[0] }} /><i style={{ right: 0, width: `${(1 - pHome) * 100}%`, background: a.colors[0], opacity: 0.85 }} /></div>
        <div className="small muted mt8" style={{ textAlign: 'center' }}>Head-to-head this save: {h2h.length ? `${h.short} ${h2hRec.hw} · draws ${h2hRec.d} · ${a.short} ${h2hRec.aw}` : 'first meeting'}{h2h[0] ? ` · last: ${state.clubs[h2h[0].homeId].short} ${h2h[0].result!.hg}–${h2h[0].result!.ag} ${state.clubs[h2h[0].awayId].short}` : ''}</div>
      </div>
      <div className="grid grid2 mt16">{col(h.id, sh)}{col(a.id, sa)}</div>
    </Panel>
  );
}
