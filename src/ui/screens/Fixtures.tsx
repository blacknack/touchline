import React, { useMemo, useState } from 'react';
import { useGame, useStore } from '../store';
import { Panel, ClubBadge } from '../components/common';
import { MatchReport, FixturePreview } from '../components/MatchReport';
import { formatDay } from '../util';
import { dayToDate } from '../../engine/attributes';

export function Fixtures() {
  const state = useGame();
  const selectedFixture = useStore((s) => s.selectedFixture);
  const [clubId, setClubId] = useState(state.manager.clubId);
  const club = state.clubs[clubId];
  const fixtures = useMemo(() => Object.values(state.fixtures).filter((f) => f.homeId === clubId || f.awayId === clubId).sort((a, b) => a.day - b.day), [state.fixtures, clubId, state.day]);
  const sel = selectedFixture !== null ? state.fixtures[selectedFixture] : null;
  const months = new Map<string, typeof fixtures>();
  for (const f of fixtures) { const d = dayToDate(f.day); const k = `${d.getUTCFullYear()}-${d.getUTCMonth()}`; if (!months.has(k)) months.set(k, []); months.get(k)!.push(f); }
  const monthName = (k: string) => { const [y, m] = k.split('-').map(Number); return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m]} ${y}`; };
  const played = fixtures.filter((f) => f.played);
  const w = played.filter((f) => f.result!.winnerId === clubId).length, d = played.filter((f) => f.result!.winnerId === null).length, l = played.length - w - d;

  return (
    <div className="grid grid-main">
      <div className="col gap12">
        {sel && (sel.played ? <MatchReport f={sel} /> : <FixturePreview f={sel} />)}
        {!sel && <Panel><div className="empty">Select a fixture to see the report or preview.</div></Panel>}
      </div>
      <div className="col gap12">
        <Panel title="Schedule" tight right={<span className="tiny muted">{w}W {d}D {l}L</span>}>
          <div style={{ padding: '8px 12px' }} className="row gap4"><select value={clubId} onChange={(e) => setClubId(Number(e.target.value))}>{Object.values(state.clubs).filter((c) => c.tier === 1 && ['ENG1', 'ESP1', 'GER1', 'ITA1', 'FRA1'].includes(c.leagueId ?? '')).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
            {[...months.entries()].map(([k, list]) => (
              <div key={k}>
                <div className="tiny dim bold" style={{ padding: '6px 12px', textTransform: 'uppercase', letterSpacing: '0.06em', background: '#0f151c' }}>{monthName(k)}</div>
                {list.map((f) => {
                  const home = f.homeId === clubId; const opp = state.clubs[home ? f.awayId : f.homeId];
                  const r = f.result; const gf = r ? (home ? r.hg : r.ag) : null, ga = r ? (home ? r.ag : r.hg) : null;
                  const res = r ? (r.winnerId === clubId ? 'W' : r.winnerId === null ? 'D' : 'L') : '';
                  return (
                    <div key={f.id} className="row clickable" style={{ padding: '7px 12px 7px 9px', borderBottom: '1px solid #1c2530', borderLeft: `3px solid ${state.competitions[f.compId]?.color ?? 'transparent'}`, background: sel?.id === f.id ? '#1f2a36' : undefined, gap: 8 }} onClick={() => useStore.setState({ selectedFixture: f.id })}>
                      <span className="tiny dim mono" style={{ width: 44 }}>{formatDay(f.day, { year: false })}</span>
                      <span className="tiny" style={{ width: 34, color: 'var(--muted)' }}>{state.competitions[f.compId]?.short}</span>
                      <ClubBadge club={opp} /><span className="grow ellipsis semibold">{home ? '' : '@ '}{opp.name}</span>
                      {r ? <span className="mono bold" style={{ color: res === 'W' ? 'var(--green)' : res === 'L' ? 'var(--red)' : 'var(--muted)' }}>{gf}–{ga}{r.pens ? ' p' : r.et ? ' aet' : ''}</span> : <span className="tiny dim">{home ? 'H' : 'A'}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
