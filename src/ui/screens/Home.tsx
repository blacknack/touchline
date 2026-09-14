import React, { useState } from 'react';
import { useStore, useGame, nextFixtureFor } from '../store';
import { Panel, ClubBadge, ClubName, PlayerLink, FormDots } from '../components/common';
import { formatDay, fmtMoney, ordinal } from '../util';
import { sortStandings } from '../../engine/competitions';
import { NewsItem } from '../../engine/types';
import { SeasonReviewModal } from '../components/SeasonReview';

const CAT_COLORS: Record<string, string> = { match: '#8fd3ff', transfer: '#f5c518', injury: '#f0716b', board: '#c9a0ff', contract: '#5ee39a', competition: '#ffb86b', award: '#f5c518', general: '#c9d1d9', youth: '#5ee39a', finance: '#ffb86b', scouting: '#8fd3ff' };

export function Home() {
  const state = useGame();
  const setScreen = useStore((s) => s.setScreen);
  const openFixture = useStore((s) => s.openFixture);
  const openPlayer = useStore((s) => s.openPlayer);
  const markRead = useStore((s) => s.markRead);
  const [open, setOpen] = useState<NewsItem | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [reviewOpen, setReviewOpen] = useState(false);
  const review = state.seasonReview;
  const club = state.clubs[state.manager.clubId];
  const next = nextFixtureFor(state);
  const league = state.competitions[club.leagueId ?? ''];
  const table = league?.standings ? sortStandings(league.standings, state.clubs) : [];
  const myPos = table.findIndex((r) => r.clubId === club.id);
  const last = state.lastMatchResult !== null ? state.fixtures[state.lastMatchResult] : null;
  const news = state.news.filter((n) => filter === 'all' || !n.read).slice(0, 60);
  const injured = club.players.map((id) => state.players[id]).filter((p) => p.injury);
  const suspended = club.players.map((id) => state.players[id]).filter((p) => Object.values(p.suspension).some((v) => v > 0));
  const tableSlice = (() => {
    if (myPos < 0) return table.slice(0, 6);
    const start = Math.max(0, Math.min(myPos - 2, table.length - 6));
    return table.slice(start, start + 6);
  })();

  return (
    <div className="grid grid-main">
      <div className="col gap12">
        {state.manager.unemployed && <Panel title="Unemployed"><div>You were dismissed. Job offers: choose a new club from the Club screen.</div></Panel>}
        {review && (
          <div className="panel" style={{ borderColor: review.seen ? undefined : 'var(--accent)' }}>
            <div className="pb row between wrap">
              <div><div className="bold">Season {review.season} review</div><div className="small muted">{review.clubName} finished {review.position}{['st', 'nd', 'rd'][review.position - 1] ?? 'th'} in the {review.leagueName}{review.honours.length ? ` · 🏆 ${review.honours.join(', ')}` : ''}</div></div>
              <button className={`btn sm ${review.seen ? '' : 'primary'}`} onClick={() => { setReviewOpen(true); review.seen = true; }}>Open review</button>
            </div>
          </div>
        )}
        {next && (
          <Panel title={`Next match · ${state.competitions[next.compId]?.name}${next.stageName ? ` · ${next.stageName}` : ''}`} right={<span className="small muted">{formatDay(next.day, { weekday: true })}</span>}>
            <div className="row between wrap">
              <div className="row gap12">
                <ClubBadge club={state.clubs[next.homeId]} size="lg" /><div className="bold">{state.clubs[next.homeId].name}</div>
                <span className="muted">v</span>
                <div className="bold">{state.clubs[next.awayId].name}</div><ClubBadge club={state.clubs[next.awayId]} size="lg" />
              </div>
              <div className="row gap4">
                <button className="btn sm" onClick={() => setScreen('tactics')}>Tactics</button>
                <button className="btn sm" onClick={() => openFixture(next.id)}>Preview</button>
              </div>
            </div>
            <div className="small muted mt8">{next.homeId === club.id ? `Home at ${club.stadium}` : `Away at ${state.clubs[next.homeId].stadium}`} · Opponent form: <FormDots form={state.competitions[state.clubs[next.homeId === club.id ? next.awayId : next.homeId].leagueId ?? '']?.standings?.find((s) => s.clubId === (next.homeId === club.id ? next.awayId : next.homeId))?.form ?? []} /></div>
          </Panel>
        )}
        <Panel title="Inbox" tight right={<div className="seg"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button><button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>Unread</button></div>}>
          {news.length === 0 && <div className="empty">Nothing here yet.</div>}
          {news.map((n) => (
            <div key={n.id} className={`news-item ${n.read ? '' : 'unread'}`} onClick={() => { markRead(n.id); setOpen(n); }}>
              <div className="row between"><div className="t"><span className="cat" style={{ color: CAT_COLORS[n.category] }}>{n.category}</span>{n.title}</div><span className="tiny dim nowrap">{formatDay(n.day, { year: false })}</span></div>
              <div className="b ellipsis">{n.body}</div>
            </div>
          ))}
        </Panel>
      </div>
      <div className="col gap12">
        {last?.result && (
          <Panel title="Last result">
            <div className="row center gap12 clickable" onClick={() => openFixture(last.id)}>
              <ClubBadge club={state.clubs[last.homeId]} /><span className="bold">{state.clubs[last.homeId].short}</span>
              <span className="mono bold" style={{ fontSize: 22 }}>{last.result.hg}–{last.result.ag}</span>
              <span className="bold">{state.clubs[last.awayId].short}</span><ClubBadge club={state.clubs[last.awayId]} />
            </div>
            <div className="small muted" style={{ textAlign: 'center' }}>{state.competitions[last.compId]?.name}{last.result.pens ? ` · pens ${last.result.pens[0]}-${last.result.pens[1]}` : last.result.et ? ' · aet' : ''}</div>
          </Panel>
        )}
        {league && (
          <Panel title={league.name} tight right={<button className="btn sm ghost" onClick={() => useStore.getState().openComp(league.id)}>Full table</button>}>
            <table className="tbl">
              <thead><tr><th>#</th><th>Club</th><th className="num">P</th><th className="num">GD</th><th className="num">Pts</th></tr></thead>
              <tbody>
                {tableSlice.map((r) => { const i = table.indexOf(r); return (
                  <tr key={r.clubId} className={r.clubId === club.id ? 'mine' : ''}>
                    <td className="num">{i + 1}</td><td><ClubName club={state.clubs[r.clubId]} short /></td><td className="num">{r.p}</td><td className="num">{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</td><td className="num bold">{r.pts - r.deduction}</td>
                  </tr>); })}
              </tbody>
            </table>
          </Panel>
        )}
        <Panel title="Club status">
          <div className="kv">
            <span className="k">League position</span><span>{myPos >= 0 && (table[myPos]?.p ?? 0) > 0 ? ordinal(myPos + 1) : '–'} · expectation: <b>{club.expectation}</b></span>
            <span className="k">Board confidence</span><span style={{ color: club.boardConfidence < 35 ? 'var(--red)' : club.boardConfidence > 70 ? 'var(--green)' : undefined }}>{Math.round(club.boardConfidence)}%</span>
            <span className="k">Fans</span><span>{Math.round(club.fanHappiness)}%</span>
            <span className="k">Transfer budget</span><span className="mono">{fmtMoney(club.transferBudget)}</span>
            <span className="k">Balance</span><span className="mono" style={{ color: club.balance < 0 ? 'var(--red)' : undefined }}>{fmtMoney(club.balance)}</span>
          </div>
        </Panel>
        {(injured.length > 0 || suspended.length > 0) && (
          <Panel title="Unavailable">
            {injured.map((p) => <div key={p.id} className="row between small"><PlayerLink p={p} /><span className="red">{p.injury!.type} · {p.injury!.daysLeft}d</span></div>)}
            {suspended.map((p) => <div key={p.id} className="row between small"><PlayerLink p={p} /><span className="gold">suspended {Object.entries(p.suspension).filter(([, v]) => v > 0).map(([k, v]) => `${state.competitions[k]?.short ?? k} ${v}`).join(', ')}</span></div>)}
          </Panel>
        )}
      </div>
      {reviewOpen && review && <SeasonReviewModal review={review} onClose={() => setReviewOpen(false)} />}
      {open && (
        <div className="modal-bg" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="mh"><div><span className="cat" style={{ color: CAT_COLORS[open.category] }}>{open.category}</span><b>{open.title}</b></div><span className="small muted">{formatDay(open.day)}</span></div>
            <div className="mb">
              <p style={{ margin: 0, lineHeight: 1.6 }}>{open.body}</p>
              <div className="row gap4 mt16">
                {open.fixtureId !== undefined && <button className="btn sm" onClick={() => { setOpen(null); openFixture(open.fixtureId!); }}>Match details</button>}
                {open.playerId !== undefined && state.players[open.playerId] && <button className="btn sm" onClick={() => { setOpen(null); openPlayer(open.playerId!); }}>Player</button>}
                {open.category === 'transfer' && <button className="btn sm" onClick={() => { setOpen(null); setScreen('transfers'); }}>Transfers</button>}
                <button className="btn sm ghost" onClick={() => setOpen(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
