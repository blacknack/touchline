import React from 'react';
import { useStore, useGame, Screen, nextFixtureFor } from './store';
import { ClubBadge } from './components/common';
import { formatDay } from '../engine/attributes';
import { fmtMoney } from './util';
import { SaveModal } from './components/SaveModal';

const NAV: { id: Screen; label: string; ic: string }[] = [
  { id: 'home', label: 'Home', ic: '🏠' },
  { id: 'squad', label: 'Squad', ic: '👥' },
  { id: 'tactics', label: 'Tactics', ic: '📋' },
  { id: 'fixtures', label: 'Fixtures', ic: '📅' },
  { id: 'competitions', label: 'Competitions', ic: '🏆' },
  { id: 'transfers', label: 'Transfers', ic: '💼' },
  { id: 'finances', label: 'Finances', ic: '💶' },
  { id: 'club', label: 'Club', ic: '🏟️' },
  { id: 'stats', label: 'Stats', ic: '📊' },
  { id: 'history', label: 'History', ic: '📜' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const state = useGame();
  const screen = useStore((s) => s.screen);
  const setScreen = useStore((s) => s.setScreen);
  const continueDays = useStore((s) => s.continueDays);
  const advancing = useStore((s) => s.advancing);
  const save = useStore((s) => s.save);
  const showToast = useStore((s) => s.showToast);
  const saveModal = useStore((s) => s.saveModal);
  const club = state.clubs[state.manager.clubId];
  const unread = state.news.filter((n) => !n.read).length;
  const pendingOffers = state.offers.filter((o) => o.status === 'pending' && o.isUserSale).length + state.offers.filter((o) => o.status === 'accepted' && o.isUserBid).length;
  const next = nextFixtureFor(state);
  const inMatch = screen === 'match' && state.pendingUserFixture !== null;
  const matchPending = state.pendingUserFixture !== null;

  const contBtn = (
    <button className="btn primary" disabled={advancing || inMatch} onClick={() => { if (matchPending) setScreen('match'); else void continueDays(); }}>
      {advancing ? 'Simulating…' : matchPending ? '⚽ Match day' : next ? `Continue ▸` : 'Continue ▸'}
    </button>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><div className="t">Touchline Manager</div><div className="tiny dim">{state.seasonYear}/{String(state.seasonYear + 1).slice(2)}</div></div>
        <div className="club clickable" onClick={() => setScreen('club')}>
          <ClubBadge club={club} size="lg" />
          <div className="col" style={{ gap: 0, minWidth: 0 }}><div className="bold ellipsis">{club.name}</div><div className="tiny muted ellipsis">{state.manager.name}</div></div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.id} className={screen === n.id || (n.id === 'home' && screen === 'inbox') ? 'active' : ''} onClick={() => setScreen(n.id)}>
              <span className="ic">{n.ic}</span>{n.label}
              {n.id === 'home' && unread > 0 && <span className="badge">{unread}</span>}
              {n.id === 'transfers' && pendingOffers > 0 && <span className="badge">{pendingOffers}</span>}
            </button>
          ))}
        </nav>
        <div style={{ padding: 10, borderTop: '1px solid var(--line)' }} className="col">
          <div className="row between small"><span className="muted">Budget</span><span className="mono">{fmtMoney(club.transferBudget)}</span></div>
          <div className="row gap4">
            <button className="btn sm grow" onClick={() => { void save().then(() => showToast('Game saved')); }}>Save</button>
            <button className="btn sm" title="Save slots, load, export/import" onClick={() => useStore.setState({ saveModal: true })}>💾</button>
            <button className="btn sm grow" onClick={() => { if (confirm('Return to the main menu? Unsaved progress is auto-saved at each stop.')) { void save(); useStore.setState({ screen: 'start' }); } }}>Menu</button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="date">{formatDay(state.day, { weekday: true })}</div>
          {state.transferWindowOpen && <span className="pill" style={{ background: '#1f3a2a', color: 'var(--green)' }}>Window open</span>}
          <div className="grow" />
          {next && !matchPending && <div className="small muted hide-mobile">Next: {state.clubs[next.homeId].short} v {state.clubs[next.awayId].short} · {formatDay(next.day, { year: false })} · {state.competitions[next.compId]?.short}</div>}
          {contBtn}
        </header>
        <div className="content"><div className="content-inner">{children}</div></div>
        {saveModal && <SaveModal mode="save" onClose={() => useStore.setState({ saveModal: false })} />}
        <nav className="bottomnav">
          {NAV.slice(0, 8).map((n) => (
            <button key={n.id} className={screen === n.id ? 'active' : ''} onClick={() => setScreen(n.id)}><span className="ic">{n.ic}</span>{n.label}</button>
          ))}
          <button onClick={() => useStore.setState({ saveModal: true })}><span className="ic">💾</span>Save</button>
          <button onClick={() => { void save(); useStore.setState({ screen: 'start' }); }}><span className="ic">🏠</span>Menu</button>
        </nav>
      </div>
    </div>
  );
}
