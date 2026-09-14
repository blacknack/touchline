import React, { useMemo, useState } from 'react';
import { useGame, useStore } from '../store';
import { Panel, ClubBadge, PosTag, Ovr, PlayerLink, Stars, ClubName } from '../components/common';
import { fmtMoney, age, formatDay, POS_ORDER, ordinal } from '../util';
import { nationName, nationFlag } from '../../engine/data/nations';
import { BidModal } from './Transfers';
import { Player } from '../../engine/types';
import { pickLineup } from '../../engine/tactics';
import { addNews } from '../../engine/season';

export function ClubScreen() {
  const state = useGame();
  const selectedClub = useStore((s) => s.selectedClub);
  const club = state.clubs[selectedClub ?? state.manager.clubId];
  const mine = club.id === state.manager.clubId;
  const players = useMemo(() => club.players.map((id) => state.players[id]).filter(Boolean).sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || b.ovr - a.ovr), [club.players, state.day]);
  const [bidFor, setBidFor] = useState<Player | null>(null);
  const league = state.competitions[club.leagueId ?? ''];
  const pos = league?.standings ? league.standings.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga)).findIndex((s) => s.clubId === club.id) + 1 : 0;
  const recent = Object.values(state.fixtures).filter((f) => f.played && (f.homeId === club.id || f.awayId === club.id)).sort((a, b) => b.day - a.day).slice(0, 6);
  const comps = Object.values(state.competitions).filter((c) => c.teams.includes(club.id));
  const takeOver = () => {
    if (!confirm(`Take charge of ${club.name}?`)) return;
    const old = state.clubs[state.manager.clubId];
    old.managerName = '';
    state.manager.clubId = club.id; state.manager.unemployed = false; club.managerName = state.manager.name; club.boardConfidence = 60;
    club.lineup = pickLineup(club, state.players, club.leagueId ?? 'ALL');
    addNews(state, { category: 'board', title: `Welcome to ${club.name}`, body: `You are the new head coach of ${club.name}. Expectation: ${club.expectation}.`, important: true });
    useStore.setState({ selectedClub: club.id, selectedComp: club.leagueId, tick: Date.now(), screen: 'home' });
  };
  return (
    <div className="col gap12">
      <div className="row gap16 wrap">
        <ClubBadge club={club} size="xl" />
        <div className="col grow" style={{ gap: 2 }}>
          <h1>{club.name}</h1>
          <div className="muted small">{club.nick ? `${club.nick} · ` : ''}{nationFlag(club.nation)} {nationName(club.nation)} · {league ? league.name : `Tier ${club.tier}`}{pos ? ` · ${ordinal(pos)}` : ''} · {club.stadium} ({club.capacity.toLocaleString()})</div>
          <div className="row gap12 small"><Stars v={club.reputation / 20} /><span className="muted">reputation {club.reputation}</span><span className="muted">manager: {club.managerName || 'AI'}</span></div>
        </div>
        {!mine && state.manager.unemployed && ['ENG1', 'ESP1', 'GER1', 'ITA1', 'FRA1'].includes(club.leagueId ?? '') && <button className="btn primary" onClick={takeOver}>Take the job</button>}
        {!mine && !state.manager.unemployed && <span className="small muted">Competitions: {comps.map((c) => c.short).join(', ')}</span>}
      </div>
      <div className="grid grid-main">
        <Panel title="Squad" tight>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>#</th><th>Pos</th><th>Player</th><th className="num">Age</th><th className="c">OVR</th><th className="num hide-mobile">Value</th><th className="num hide-mobile">Apps</th><th className="num hide-mobile">Gls</th><th className="num hide-mobile">Contract</th>{!mine && <th></th>}</tr></thead>
              <tbody>{players.map((p) => (
                <tr key={p.id} className="hover" onClick={() => useStore.getState().openPlayer(p.id)}>
                  <td className="num dim">{p.number}</td><td><PosTag pos={p.pos} /></td><td><PlayerLink p={p} />{p.injury ? ' 🩹' : ''}</td><td className="num">{age(state, p)}</td><td className="c"><Ovr v={p.ovr} /></td>
                  <td className="num hide-mobile">{fmtMoney(p.value)}</td><td className="num hide-mobile">{p.stats['ALL']?.apps ?? 0}</td><td className="num hide-mobile">{p.stats['ALL']?.goals ?? 0}</td><td className="num hide-mobile">{p.contractEnd}</td>
                  {!mine && <td><button className="btn sm" onClick={(e) => { e.stopPropagation(); setBidFor(p); }}>Bid</button></td>}
                </tr>))}</tbody>
            </table>
          </div>
        </Panel>
        <div className="col gap12">
          <Panel title="Details">
            <div className="kv small">
              <span className="k">Balance</span><span className="mono">{fmtMoney(club.balance)}</span>
              <span className="k">Transfer budget</span><span className="mono">{fmtMoney(club.transferBudget)}</span>
              <span className="k">Wage bill</span><span className="mono">{fmtMoney(players.reduce((s, p) => s + p.wage, 0))}/wk</span>
              <span className="k">Formation</span><span>{club.tactic.formation}</span>
              <span className="k">Expectation</span><span>{club.expectation}</span>
              {mine && <><span className="k">Board confidence</span><span>{Math.round(club.boardConfidence)}%</span></>}
              <span className="k">Rivals</span><span>{club.rivals.map((id) => state.clubs[id]?.name).filter(Boolean).join(', ') || '-'}</span>
            </div>
          </Panel>
          <Panel title="Recent results" tight>
            {recent.map((f) => { const home = f.homeId === club.id; const opp = state.clubs[home ? f.awayId : f.homeId]; const r = f.result!; const gf = home ? r.hg : r.ag, ga = home ? r.ag : r.hg; return (
              <div key={f.id} className="row small clickable" style={{ padding: '6px 12px', borderBottom: '1px solid #1c2530', gap: 8 }} onClick={() => useStore.getState().openFixture(f.id)}>
                <span className="tiny dim mono" style={{ width: 44 }}>{formatDay(f.day, { year: false })}</span><span className="tiny muted" style={{ width: 34 }}>{state.competitions[f.compId]?.short}</span><span className="grow ellipsis">{home ? '' : '@ '}<ClubName club={opp} short /></span><span className="mono bold" style={{ color: gf > ga ? 'var(--green)' : gf < ga ? 'var(--red)' : 'var(--muted)' }}>{gf}–{ga}</span>
              </div>); })}
            {recent.length === 0 && <div className="empty">No matches yet.</div>}
          </Panel>
          <Panel title="Honours" tight>
            {club.honours.length === 0 && <div className="empty">None in this save yet.</div>}
            {club.honours.slice().reverse().slice(0, 12).map((h, i) => <div key={i} className="small" style={{ padding: '5px 12px', borderBottom: '1px solid #1c2530' }}>🏆 {h.compName} <span className="muted">{h.season}</span></div>)}
          </Panel>
        </div>
      </div>
      {bidFor && <BidModal p={bidFor} onClose={() => setBidFor(null)} />}
    </div>
  );
}
