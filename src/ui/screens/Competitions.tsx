import React, { useMemo, useState } from 'react';
import { useGame, useStore } from '../store';
import { Panel, ClubName, FormDots, ClubBadge, Tabs, PlayerLink } from '../components/common';
import { sortStandings } from '../../engine/competitions';
import { formatDay } from '../util';
import { Competition, Fixture } from '../../engine/types';

export function Competitions() {
  const state = useGame();
  const selectedComp = useStore((s) => s.selectedComp);
  const comps = Object.values(state.competitions);
  const groups: [string, Competition[]][] = [
    ['Leagues', comps.filter((c) => c.type === 'league')],
    ['Europe', comps.filter((c) => c.type === 'euro' || c.id === 'USC')],
    ['Domestic cups', comps.filter((c) => c.type === 'cup')],
    ['Super cups', comps.filter((c) => c.type === 'supercup' && c.id !== 'USC')],
  ];
  const comp = state.competitions[selectedComp ?? ''] ?? comps[0];
  const [tab, setTab] = useState<'table' | 'fixtures' | 'scorers'>('table');
  const mine = state.manager.clubId;

  return (
    <div className="col gap12">
      <div className="row wrap gap4">
        {groups.map(([g, list]) => (
          <div key={g} className="row gap4 wrap" style={{ marginRight: 12 }}>
            <span className="tiny dim bold" style={{ textTransform: 'uppercase' }}>{g}</span>
            {list.map((c) => <button key={c.id} className={`btn sm ${comp.id === c.id ? 'primary' : ''}`} style={comp.id !== c.id ? { borderLeft: `3px solid ${c.color}` } : undefined} onClick={() => useStore.setState({ selectedComp: c.id })}>{c.short}{c.teams.includes(mine) ? ' •' : ''}</button>)}
          </div>
        ))}
      </div>
      <h2>{comp.name} <span className="muted" style={{ fontWeight: 400 }}>{state.seasonYear}/{String(state.seasonYear + 1).slice(2)}</span>{comp.winnerId && <span className="gold"> · 🏆 {state.clubs[comp.winnerId].name}</span>}</h2>
      <Tabs tabs={[{ id: 'table', label: comp.standings ? 'Table' : 'Rounds' }, { id: 'fixtures', label: 'Fixtures & results' }, { id: 'scorers', label: 'Top scorers' }]} value={tab} onChange={setTab} />
      {tab === 'table' && (comp.standings ? <LeagueTable comp={comp} /> : <CupRounds comp={comp} />)}
      {tab === 'table' && comp.standings && comp.stages && <div className="mt16"><h3 className="mb8">Knockout phase</h3><CupRounds comp={comp} /></div>}
      {tab === 'fixtures' && <CompFixtures comp={comp} />}
      {tab === 'scorers' && <Scorers comp={comp} />}
    </div>
  );
}

function LeagueTable({ comp }: { comp: Competition }) {
  const state = useGame();
  const rows = sortStandings(comp.standings!, state.clubs);
  const n = rows.length;
  const zone = (i: number) => {
    if (comp.type === 'euro') return i < 8 ? '#1f3a2a' : i < 24 ? '#2a2f1a' : '#331e1e';
    const nat = comp.nation;
    const ucl = nat === 'FRA' ? 3 : 4, uel = ucl + 1, uecl = uel + 1;
    if (i < ucl) return '#1f3a2a'; if (i < uel) return '#1f2f3a'; if (i < uecl) return '#2a2f1a';
    if (i >= n - 3) return '#331e1e';
    return undefined;
  };
  return (
    <Panel tight>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>#</th><th>Club</th><th className="num">P</th><th className="num">W</th><th className="num">D</th><th className="num">L</th><th className="num">GF</th><th className="num">GA</th><th className="num">GD</th><th className="num">Pts</th><th className="hide-mobile">Form</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.clubId} className={r.clubId === state.manager.clubId ? 'mine' : ''}>
                <td className="num" style={{ borderLeft: `4px solid ${zone(i) ?? 'transparent'}` }}>{i + 1}</td>
                <td><ClubName club={state.clubs[r.clubId]} /></td>
                <td className="num">{r.p}</td><td className="num">{r.w}</td><td className="num">{r.d}</td><td className="num">{r.l}</td><td className="num">{r.gf}</td><td className="num">{r.ga}</td><td className="num">{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</td><td className="num bold">{r.pts - r.deduction}</td>
                <td className="hide-mobile"><FormDots form={r.form} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tiny dim" style={{ padding: '6px 12px' }}>{comp.type === 'euro' ? 'Top 8 straight to the round of 16 · 9–24 into the knockout play-offs · 25–36 eliminated' : 'Green: Champions League · Blue: Europa League · Yellow: Conference League · Red: relegation'}</div>
    </Panel>
  );
}

function CupRounds({ comp }: { comp: Competition }) {
  const state = useGame();
  const openFixture = useStore((s) => s.openFixture);
  const stages = comp.stages ?? [];
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
      {stages.map((st, i) => {
        const fx = st.fixtureIds.map((id) => state.fixtures[id]);
        const ties = new Map<number | string, Fixture[]>();
        for (const f of fx) { const k = f.tieId ?? f.id; if (!ties.has(k)) ties.set(k, []); ties.get(k)!.push(f); }
        return (
          <Panel key={i} title={st.name} tight right={<span className="tiny muted">{formatDay(st.day, { year: false })}{st.day2 ? ` & ${formatDay(st.day2, { year: false })}` : ''}</span>}>
            {!st.drawn && <div className="empty">Draw pending</div>}
            {[...ties.values()].map((legs) => {
              const f1 = legs[0], f2 = legs[1];
              const mine = legs.some((f) => f.homeId === state.manager.clubId || f.awayId === state.manager.clubId);
              const agg = f2?.result && f1.result ? [f1.result.hg + f2.result.ag, f1.result.ag + f2.result.hg] : null;
              const winner = (f2 ?? f1).result?.winnerId;
              return (
                <div key={f1.id} className="row clickable small" style={{ padding: '6px 10px', borderBottom: '1px solid #1c2530', background: mine ? '#1f2a1a' : undefined, gap: 6 }} onClick={() => openFixture((f2 && f2.played ? f2 : f1).id)}>
                  <ClubBadge club={state.clubs[f1.homeId]} /><span className="grow ellipsis" style={{ fontWeight: winner === f1.homeId ? 700 : 400 }}>{state.clubs[f1.homeId].short}</span>
                  <span className="mono bold">{f1.result ? `${f1.result.hg}–${f1.result.ag}` : 'v'}{f2 && f2.result ? ` / ${f2.result.ag}–${f2.result.hg}` : ''}{agg ? ` (${agg[0]}–${agg[1]})` : ''}{!f2 && f1.result?.pens ? ` p${f1.result.pens[0]}–${f1.result.pens[1]}` : f2?.result?.pens ? ` p` : ''}</span>
                  <span className="grow ellipsis right" style={{ fontWeight: winner === f1.awayId ? 700 : 400 }}>{state.clubs[f1.awayId].short}</span><ClubBadge club={state.clubs[f1.awayId]} />
                </div>
              );
            })}
          </Panel>
        );
      })}
    </div>
  );
}

function CompFixtures({ comp }: { comp: Competition }) {
  const state = useGame();
  const openFixture = useStore((s) => s.openFixture);
  const fx = useMemo(() => comp.seasonFixtures.map((id) => state.fixtures[id]).sort((a, b) => a.day - b.day || a.stage - b.stage), [comp.seasonFixtures, state.day]);
  const byStage = new Map<string, Fixture[]>();
  for (const f of fx) { const k = f.stageName; if (!byStage.has(k)) byStage.set(k, []); byStage.get(k)!.push(f); }
  const keys = [...byStage.keys()];
  const nextIdx = Math.max(0, keys.findIndex((k) => byStage.get(k)!.some((f) => !f.played)));
  const [idx, setIdx] = useState(nextIdx);
  const k = keys[Math.min(idx, keys.length - 1)];
  const list = byStage.get(k) ?? [];
  return (
    <Panel tight title={k ?? ''} right={<div className="row gap4"><button className="btn sm" disabled={idx <= 0} onClick={() => setIdx(idx - 1)}>◂</button><span className="tiny muted">{idx + 1}/{keys.length}</span><button className="btn sm" disabled={idx >= keys.length - 1} onClick={() => setIdx(idx + 1)}>▸</button></div>}>
      {list.map((f) => (
        <div key={f.id} className="row clickable" style={{ padding: '7px 12px', borderBottom: '1px solid #1c2530', background: f.homeId === state.manager.clubId || f.awayId === state.manager.clubId ? '#1f2a1a' : undefined }} onClick={() => openFixture(f.id)}>
          <span className="tiny dim mono" style={{ width: 48 }}>{formatDay(f.day, { year: false })}</span>
          <span className="grow right ellipsis semibold">{state.clubs[f.homeId].name}</span><ClubBadge club={state.clubs[f.homeId]} />
          <span className="mono bold" style={{ width: 60, textAlign: 'center' }}>{f.result ? `${f.result.hg}–${f.result.ag}` : 'v'}</span>
          <ClubBadge club={state.clubs[f.awayId]} /><span className="grow ellipsis semibold">{state.clubs[f.awayId].name}</span>
        </div>
      ))}
    </Panel>
  );
}

function Scorers({ comp }: { comp: Competition }) {
  const state = useGame();
  const list = useMemo(() => Object.values(state.players).filter((p) => p.stats[comp.id]?.goals || p.stats[comp.id]?.assists).sort((a, b) => (b.stats[comp.id].goals - a.stats[comp.id].goals) || (b.stats[comp.id].assists - a.stats[comp.id].assists)).slice(0, 30), [state.players, comp.id, state.day]);
  return (
    <Panel tight>
      <table className="tbl"><thead><tr><th>#</th><th>Player</th><th>Club</th><th className="num">Apps</th><th className="num">Goals</th><th className="num">Assists</th><th className="num">Avg</th></tr></thead>
        <tbody>{list.map((p, i) => { const s = p.stats[comp.id]; return <tr key={p.id}><td className="num">{i + 1}</td><td><PlayerLink p={p} /></td><td>{p.clubId !== null && <ClubName club={state.clubs[p.clubId]} short />}</td><td className="num">{s.apps}</td><td className="num bold">{s.goals}</td><td className="num">{s.assists}</td><td className="num">{(s.ratingSum / s.apps).toFixed(2)}</td></tr>; })}</tbody>
      </table>
      {list.length === 0 && <div className="empty">No goals yet.</div>}
    </Panel>
  );
}
