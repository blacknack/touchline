import React from 'react';
import { useGame } from '../store';
import { Panel, ClubName } from '../components/common';

export function History() {
  const state = useGame();
  const seasons = [...new Set(state.honours.map((h) => h.season))].reverse();
  const awardSeasons = [...new Set(state.awards.filter((a) => !a.name.includes('Month')).map((a) => a.season))].reverse();
  return (
    <div className="grid grid2">
      <div className="col gap12">
        <Panel title="Manager career" tight>
          <table className="tbl"><thead><tr><th>Season</th><th>Club</th><th className="num">League</th><th>Honours</th></tr></thead>
            <tbody>{state.manager.history.slice().reverse().map((h, i) => <tr key={i}><td>{h.season}</td><td><ClubName club={state.clubs[h.clubId]} /></td><td className="num">{h.leaguePos ?? '-'}</td><td className="small">{h.honours.join(', ') || '–'}</td></tr>)}</tbody></table>
          {state.manager.history.length === 0 && <div className="empty">Your first season is under way. Reputation: {Math.round(state.manager.reputation)}.</div>}
        </Panel>
        {seasons.map((s) => (
          <Panel key={s} title={`Honours ${s}`} tight>
            {state.honours.filter((h) => h.season === s).map((h, i) => <div key={i} className="row small" style={{ padding: '5px 12px', borderBottom: '1px solid #1c2530', gap: 8 }}><span className="grow">{h.compName}</span><ClubName club={state.clubs[h.winnerId]} />{h.topScorer && state.players[h.topScorer.playerId] && <span className="tiny muted">⚽ {state.players[h.topScorer.playerId].name} {h.topScorer.goals}</span>}</div>)}
          </Panel>
        ))}
        {seasons.length === 0 && <Panel><div className="empty">Honours will appear here at the end of each season.</div></Panel>}
      </div>
      <div className="col gap12">
        {awardSeasons.map((s) => (
          <Panel key={s} title={`Awards ${s}`} tight>
            {state.awards.filter((a) => a.season === s && !a.name.includes('Month')).map((a, i) => <div key={i} className="row small" style={{ padding: '5px 12px', borderBottom: '1px solid #1c2530', gap: 8 }}><span className="grow">{a.name}</span><b>{state.players[a.playerId]?.name ?? a.playerName}</b><span className="tiny muted">{a.detail}</span></div>)}
          </Panel>
        ))}
        <Panel title="Player of the Month" tight>
          {state.awards.filter((a) => a.name.includes('Month')).slice(-15).reverse().map((a, i) => <div key={i} className="row small" style={{ padding: '5px 12px', borderBottom: '1px solid #1c2530', gap: 8 }}><span className="grow muted">{a.name.replace(' Player of the Month', '')}</span><b>{state.players[a.playerId]?.name ?? a.playerName}</b><span className="tiny muted">{a.season}</span></div>)}
          {state.awards.length === 0 && <div className="empty">Nothing yet.</div>}
        </Panel>
      </div>
    </div>
  );
}
