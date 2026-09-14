import React from 'react';
import { SeasonReview } from '../../engine/types';
import { useGame } from '../store';
import { Modal, ClubName } from './common';

export function SeasonReviewModal({ review, onClose }: { review: SeasonReview; onClose: () => void }) {
  const state = useGame();
  const r = review.record;
  return (
    <Modal title={`${review.clubName} · ${review.season}`} onClose={onClose} width={760}>
      <div className="row wrap gap12 mb16">
        <div className="stat-tile"><div className="v">{review.position}{['st', 'nd', 'rd'][review.position - 1] ?? 'th'}</div><div className="l">{review.leagueName}</div></div>
        <div className="stat-tile"><div className="v">{r.w}-{r.d}-{r.l}</div><div className="l">W-D-L (all comps)</div></div>
        <div className="stat-tile"><div className="v">{r.gf}:{r.ga}</div><div className="l">Goals for : against</div></div>
        <div className="stat-tile"><div className="v">{review.honours.length}</div><div className="l">Trophies</div></div>
      </div>
      <p className="small" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>{review.boardVerdict}</p>
      <div className="grid grid2">
        <div>
          <div className="tiny dim bold mb8" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Final table</div>
          <table className="tbl"><thead><tr><th>#</th><th>Club</th><th className="num">P</th><th className="num">GD</th><th className="num">Pts</th></tr></thead>
            <tbody>{review.table.map((row, i) => <tr key={row.clubId} className={row.clubId === review.clubId ? 'mine' : ''}><td className="num">{i + 1}</td><td>{state.clubs[row.clubId] ? <ClubName club={state.clubs[row.clubId]} short /> : '?'}</td><td className="num">{row.p}</td><td className="num">{row.gf - row.ga > 0 ? '+' : ''}{row.gf - row.ga}</td><td className="num bold">{row.pts}</td></tr>)}</tbody></table>
        </div>
        <div className="col gap12">
          <div>
            <div className="tiny dim bold mb8" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Honours & cup runs</div>
            {review.honours.map((h) => <div key={h} className="small gold">🏆 {h}</div>)}
            {review.cupRuns.map((c) => <div key={c.comp} className="small muted">{c.comp}: {c.stage}</div>)}
          </div>
          <div>
            <div className="tiny dim bold mb8" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Players</div>
            {review.topScorer && <div className="small">⚽ Top scorer: <b>{review.topScorer.name}</b> ({review.topScorer.goals})</div>}
            {review.bestPlayer && <div className="small">⭐ Best average rating: <b>{review.bestPlayer.name}</b> ({review.bestPlayer.avg.toFixed(2)})</div>}
            {review.awards.map((a) => <div key={a.name} className="small">🏅 {a.name}: <b>{a.playerName}</b> <span className="muted">{a.detail}</span></div>)}
          </div>
        </div>
      </div>
      <div className="row mt16" style={{ justifyContent: 'flex-end' }}><button className="btn primary" onClick={onClose}>On to the new season ▸</button></div>
    </Modal>
  );
}
