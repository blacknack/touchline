import React, { useMemo, useState } from 'react';
import { useGame, useStore } from '../store';
import { Panel, PosTag, Ovr, PlayerLink, Bar, Seg } from '../components/common';
import { age, fmtMoney, POS_ORDER, conditionColor, moraleLabel, statAvg, contractLabel, flag } from '../util';
import { Player } from '../../engine/types';

type SortKey = 'pos' | 'name' | 'age' | 'ovr' | 'pot' | 'value' | 'wage' | 'contract' | 'cond' | 'morale' | 'apps' | 'goals' | 'assists' | 'rating' | 'number';

export function Squad() {
  const state = useGame();
  const setTraining = useStore((s) => s.setTraining);
  const club = state.clubs[state.manager.clubId];
  const [sort, setSort] = useState<SortKey>('pos');
  const [dir, setDir] = useState<1 | -1>(1);
  const [view, setView] = useState<'overview' | 'stats' | 'contracts'>('overview');
  const players = useMemo(() => club.players.map((id) => state.players[id]).filter(Boolean), [club.players, state.players, state.day]);
  const inXI = new Set(club.lineup.starters.filter((x): x is number => x !== null));
  const onBench = new Set(club.lineup.bench.filter((x): x is number => x !== null));

  const keyOf = (p: Player): number | string => {
    switch (sort) {
      case 'pos': return POS_ORDER.indexOf(p.pos) * 1000 - p.ovr;
      case 'name': return p.name; case 'age': return age(state, p); case 'ovr': return -p.ovr; case 'pot': return -p.pot; case 'value': return -p.value; case 'wage': return -p.wage;
      case 'contract': return p.contractEnd; case 'cond': return -p.condition; case 'morale': return -p.morale; case 'number': return p.number;
      case 'apps': return -(p.stats['ALL']?.apps ?? 0); case 'goals': return -(p.stats['ALL']?.goals ?? 0); case 'assists': return -(p.stats['ALL']?.assists ?? 0);
      case 'rating': return -(p.stats['ALL']?.apps ? p.stats['ALL'].ratingSum / p.stats['ALL'].apps : 0);
    }
  };
  const sorted = players.slice().sort((a, b) => { const ka = keyOf(a), kb = keyOf(b); return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir; });
  const th = (k: SortKey, label: string, cls = '') => <th className={`${cls} clickable`} onClick={() => { if (sort === k) setDir(dir === 1 ? -1 : 1); else { setSort(k); setDir(1); } }}>{label}{sort === k ? (dir === 1 ? ' ▾' : ' ▴') : ''}</th>;
  const wages = players.reduce((s, p) => s + p.wage, 0);
  const avgAge = players.reduce((s, p) => s + age(state, p), 0) / Math.max(1, players.length);

  return (
    <div className="col gap12">
      <div className="row wrap between">
        <div className="row wrap gap12">
          <div className="stat-tile"><div className="v">{players.length}</div><div className="l">Players</div></div>
          <div className="stat-tile"><div className="v">{avgAge.toFixed(1)}</div><div className="l">Avg age</div></div>
          <div className="stat-tile"><div className="v" style={{ color: wages > club.wageBudget ? 'var(--red)' : undefined }}>{fmtMoney(wages)}</div><div className="l">Wages / week (budget {fmtMoney(club.wageBudget)})</div></div>
          <div className="stat-tile"><div className="v">{fmtMoney(players.reduce((s, p) => s + p.value, 0))}</div><div className="l">Squad value</div></div>
        </div>
        <div className="col gap4">
          <label className="field">Training focus
            <select value={club.training} onChange={(e) => setTraining(e.target.value as any)}>
              {['balanced', 'attacking', 'defending', 'physical', 'technical', 'tactical', 'setpieces', 'rest'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
      </div>
      <Panel tight title="Squad" right={<Seg options={[{ id: 'overview', label: 'Overview' }, { id: 'stats', label: 'Stats' }, { id: 'contracts', label: 'Contracts' }]} value={view} onChange={setView} />}>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                {th('number', '#', 'num')}{th('pos', 'Pos')}{th('name', 'Name')}{th('age', 'Age', 'num')}{th('ovr', 'OVR', 'c')}
                {view === 'overview' && <>{th('pot', 'POT', 'c')}{th('cond', 'Cond')}{th('morale', 'Morale')}<th>Status</th></>}
                {view === 'stats' && <>{th('apps', 'Apps', 'num')}{th('goals', 'Gls', 'num')}{th('assists', 'Ast', 'num')}<th className="num">Y/R</th>{th('rating', 'Avg', 'num')}</>}
                {view === 'contracts' && <>{th('value', 'Value', 'num')}{th('wage', 'Wage', 'num')}{th('contract', 'Contract', 'num')}<th>Notes</th></>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const s = p.stats['ALL'];
                const role = inXI.has(p.id) ? 'XI' : onBench.has(p.id) ? 'SUB' : '';
                return (
                  <tr key={p.id} className="hover" onClick={() => useStore.getState().openPlayer(p.id)}>
                    <td className="num dim">{p.number}</td>
                    <td><PosTag pos={p.pos} />{p.altPos.length > 0 && <span className="tiny dim" style={{ marginLeft: 4 }}>{p.altPos.join('/')}</span>}</td>
                    <td><span className="semibold">{flag(p.nat)} {p.name}</span>{role && <span className="pill" style={{ marginLeft: 6, background: role === 'XI' ? '#1f3a2a' : '#2a2f3a', color: role === 'XI' ? 'var(--green)' : 'var(--muted)' }}>{role}</span>}{p.loanFrom !== null && <span className="pill" style={{ marginLeft: 6, background: '#2a2f3a', color: 'var(--blue)' }}>LOAN</span>}</td>
                    <td className="num">{age(state, p)}</td>
                    <td className="c"><Ovr v={p.ovr} /></td>
                    {view === 'overview' && <>
                      <td className="c mono muted">{p.pot > p.ovr ? `${p.pot}` : '–'}</td>
                      <td style={{ minWidth: 90 }}><div className="row gap4"><div style={{ width: 50 }}><Bar v={p.condition} color={conditionColor(p.condition)} /></div><span className="tiny mono">{Math.round(p.condition)}%</span></div></td>
                      <td className="small">{moraleLabel(p.morale)}</td>
                      <td className="small">
                        {p.injury && <span className="red">🩹 {p.injury.type} ({p.injury.daysLeft}d)</span>}
                        {Object.entries(p.suspension).filter(([, v]) => v > 0).map(([k, v]) => <span key={k} className="gold" style={{ marginRight: 6 }}>🟥 {state.competitions[k]?.short ?? k} ×{v}</span>)}
                        {p.transferListed && <span className="blue">Listed</span>}
                        {p.contractEnd <= state.seasonYear + 1 && <span className="muted"> · expiring</span>}
                      </td>
                    </>}
                    {view === 'stats' && <>
                      <td className="num">{s?.apps ?? 0}{s?.starts !== undefined && s.apps ? <span className="dim tiny"> ({s.starts})</span> : null}</td>
                      <td className="num">{s?.goals ?? 0}</td><td className="num">{s?.assists ?? 0}</td>
                      <td className="num">{s?.yellows ?? 0}/{s?.reds ?? 0}</td><td className="num bold">{statAvg(p)}</td>
                    </>}
                    {view === 'contracts' && <>
                      <td className="num">{fmtMoney(p.value)}</td><td className="num">{fmtMoney(p.wage)}</td>
                      <td className="num" style={{ color: p.contractEnd <= state.seasonYear + 1 ? 'var(--red)' : undefined }}>{contractLabel(p)}</td>
                      <td className="small muted">{p.unhappy > 50 ? 'Unhappy' : ''}{p.loanFrom !== null ? `On loan from ${state.clubs[p.loanFrom]?.name}` : ''}</td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

export function PlayerRowMini({ p }: { p: Player }) {
  return <div className="row gap4"><PosTag pos={p.pos} /><PlayerLink p={p} /><Ovr v={p.ovr} /></div>;
}
