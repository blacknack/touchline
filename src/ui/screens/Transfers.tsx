import React, { useMemo, useState } from 'react';
import { useGame, useStore } from '../store';
import { Panel, PosTag, Ovr, PlayerLink, ClubName, Tabs, Modal } from '../components/common';
import { age, fmtMoney, formatDay, flag } from '../util';
import { searchPlayers, askingPrice, wageDemand, joinWillingness } from '../../engine/transfers';
import { Player, Pos } from '../../engine/types';
import { NATIONS } from '../../engine/data/nations';

export function BidModal({ p, onClose }: { p: Player; onClose: () => void }) {
  const state = useGame();
  const bid = useStore((s) => s.bid);
  const club = state.clubs[state.manager.clubId];
  const ask = askingPrice(state, p);
  const demand = wageDemand(state, p, club);
  const [fee, setFee] = useState(p.clubId === null ? 0 : ask);
  const [wage, setWage] = useState(demand);
  const [years, setYears] = useState(age(state, p) >= 31 ? 2 : 4);
  const [loan, setLoan] = useState(false);
  const will = joinWillingness(state, p, club, wage, years);
  const from = p.clubId !== null ? state.clubs[p.clubId] : null;
  const wages = club.players.reduce((s, id) => s + state.players[id].wage, 0);
  const canAfford = (loan ? 0 : fee) <= club.transferBudget;
  return (
    <Modal title={`${p.clubId === null ? 'Sign' : 'Bid for'} ${p.name}`} onClose={onClose}>
      <div className="kv small mb16">
        <span className="k">Club</span><span>{from ? from.name : 'Free agent'}</span>
        <span className="k">Value</span><span className="mono">{fmtMoney(p.value)}{from ? ` · asking about ${fmtMoney(ask)}` : ''}</span>
        <span className="k">Current wage</span><span className="mono">{fmtMoney(p.wage)}/wk · wants ≈ {fmtMoney(demand)}/wk</span>
        <span className="k">Contract</span><span>until {p.contractEnd}{p.transferListed ? ' · transfer listed' : ''}</span>
        <span className="k">Your budget</span><span className="mono">{fmtMoney(club.transferBudget)} · wages {fmtMoney(wages)}/{fmtMoney(club.wageBudget)}</span>
      </div>
      {from && <label className="row gap4 small mb8"><input type="checkbox" checked={loan} onChange={(e) => setLoan(e.target.checked)} /> Loan until end of season (no fee, you pay wages)</label>}
      {from && !loan && <label className="field mb8">Transfer fee: <b className="mono" style={{ color: 'var(--text)' }}>{fmtMoney(fee)}</b>
        <input type="range" min={0} max={Math.max(ask * 2, 1e6)} step={100000} value={fee} onChange={(e) => setFee(Number(e.target.value))} />
      </label>}
      <label className="field mb8">Weekly wage: <b className="mono" style={{ color: 'var(--text)' }}>{fmtMoney(wage)}</b>
        <input type="range" min={500} max={Math.max(demand * 2.5, 20000)} step={250} value={wage} onChange={(e) => setWage(Number(e.target.value))} />
      </label>
      {!loan && <label className="field mb8">Contract length: {years} years<input type="range" min={1} max={5} value={years} onChange={(e) => setYears(Number(e.target.value))} /></label>}
      <div className="small muted mb16">Player interest: <b style={{ color: will > 0.65 ? 'var(--green)' : will > 0.35 ? 'var(--gold)' : 'var(--red)' }}>{will > 0.75 ? 'keen' : will > 0.5 ? 'interested' : will > 0.3 ? 'unsure' : 'unlikely'}</b>{!state.transferWindowOpen && !loan && p.clubId !== null ? ' · window closed — the deal would be agreed for when it reopens' : ''}</div>
      <div className="row gap4">
        <button className="btn primary" disabled={!canAfford} onClick={() => { bid(p.id, loan ? 0 : fee, wage, years, loan); onClose(); }}>{p.clubId === null ? 'Offer contract' : loan ? 'Propose loan' : 'Submit bid'}</button>
        {!canAfford && <span className="small red">Not enough budget</span>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

export function Transfers() {
  const state = useGame();
  const [tab, setTab] = useState<'search' | 'offers' | 'shortlist' | 'listed' | 'recent'>('offers');
  const club = state.clubs[state.manager.clubId];
  const pendingIn = state.offers.filter((o) => o.isUserSale && o.status === 'pending');
  const myBids = state.offers.filter((o) => o.isUserBid && o.status !== 'withdrawn' && o.status !== 'completed').sort((a, b) => b.day - a.day);
  const [bidFor, setBidFor] = useState<Player | null>(null);
  return (
    <div className="col gap12">
      <div className="row wrap between">
        <div className="row gap12 wrap">
          <div className="stat-tile"><div className="v">{fmtMoney(club.transferBudget)}</div><div className="l">Transfer budget</div></div>
          <div className="stat-tile"><div className="v">{fmtMoney(club.players.reduce((s, id) => s + state.players[id].wage, 0))}</div><div className="l">Wages/wk of {fmtMoney(club.wageBudget)}</div></div>
          <div className="stat-tile"><div className="v" style={{ color: state.transferWindowOpen ? 'var(--green)' : 'var(--red)' }}>{state.transferWindowOpen ? 'OPEN' : 'CLOSED'}</div><div className="l">Transfer window</div></div>
        </div>
      </div>
      <Tabs tabs={[{ id: 'offers', label: `Offers${pendingIn.length + myBids.filter((o) => o.status === 'accepted').length ? ` (${pendingIn.length + myBids.filter((o) => o.status === 'accepted').length})` : ''}` }, { id: 'search', label: 'Player search' }, { id: 'shortlist', label: `Shortlist (${state.shortlist.length})` }, { id: 'listed', label: 'Transfer list' }, { id: 'recent', label: 'Latest deals' }]} value={tab} onChange={setTab} />
      {tab === 'offers' && <Offers />}
      {tab === 'search' && <Search onBid={setBidFor} />}
      {tab === 'shortlist' && <PlayerList ids={state.shortlist} onBid={setBidFor} empty="Shortlist players from search or their profile." />}
      {tab === 'listed' && <PlayerList ids={Object.values(state.players).filter((p) => p.transferListed && p.clubId !== null).sort((a, b) => b.ovr - a.ovr).map((p) => p.id)} onBid={setBidFor} empty="No one is transfer listed." />}
      {tab === 'recent' && <Recent />}
      {bidFor && <BidModal p={bidFor} onClose={() => setBidFor(null)} />}
    </div>
  );
}

function Offers() {
  const state = useGame();
  const { confirmOffer, rejectOffer, acceptSale } = useStore.getState();
  const incoming = state.offers.filter((o) => o.isUserSale && o.status === 'pending');
  const mine = state.offers.filter((o) => o.isUserBid && o.status !== 'withdrawn').sort((a, b) => b.day - a.day).slice(0, 30);
  return (
    <div className="grid grid2">
      <Panel title="Offers for your players" tight>
        {incoming.length === 0 && <div className="empty">No offers received.</div>}
        {incoming.map((o) => { const p = state.players[o.playerId]; return (
          <div key={o.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
            <div className="row between"><div><PlayerLink p={p} /> <span className="muted small">({p.pos}, {p.ovr})</span></div><span className="mono bold gold">{fmtMoney(o.fee)}</span></div>
            <div className="small muted">from <ClubName club={state.clubs[o.toClubId]} /> · value {fmtMoney(p.value)} · {formatDay(o.day, { year: false })}</div>
            <div className="row gap4 mt8"><button className="btn sm primary" onClick={() => acceptSale(o.id)}>Accept</button><button className="btn sm" onClick={() => rejectOffer(o.id)}>Reject</button></div>
          </div>); })}
      </Panel>
      <Panel title="Your bids" tight>
        {mine.length === 0 && <div className="empty">You haven't made any bids.</div>}
        {mine.map((o) => { const p = state.players[o.playerId]; if (!p) return null; const color = o.status === 'accepted' ? 'var(--green)' : o.status === 'pending' ? 'var(--gold)' : o.status === 'completed' ? 'var(--blue)' : 'var(--red)'; return (
          <div key={o.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
            <div className="row between"><div><PlayerLink p={p} /> <span className="muted small">({p.pos}, {p.ovr})</span></div><span className="mono">{o.isLoan ? 'Loan' : fmtMoney(o.fee)} · {fmtMoney(o.wage)}/wk</span></div>
            <div className="small" style={{ color }}>{o.status.replace('_', ' ')}{o.response ? ` — ${o.response}` : ''}</div>
            {o.status === 'accepted' && <div className="row gap4 mt8"><button className="btn sm primary" onClick={() => confirmOffer(o.id)}>Complete signing</button><button className="btn sm" onClick={() => rejectOffer(o.id)}>Withdraw</button></div>}
            {o.status === 'rejected' && o.counterFee && <div className="row gap4 mt8"><button className="btn sm" onClick={() => useStore.getState().bid(p.id, o.counterFee!, o.wage, o.years)}>Bid {fmtMoney(o.counterFee)}</button></div>}
          </div>); })}
      </Panel>
    </div>
  );
}

function Search({ onBid }: { onBid: (p: Player) => void }) {
  const state = useGame();
  const [q, setQ] = useState({ text: '', pos: 'ANY' as Pos | 'ANY', minOvr: 60, maxAge: 40, maxValue: 0, listedOnly: false, freeOnly: false, nation: '' });
  const results = useMemo(() => searchPlayers(state, { ...q, maxValue: q.maxValue || undefined, nation: q.nation || undefined, excludeClub: state.manager.clubId }, 150), [q, state.day, state.players]);
  return (
    <div className="col gap12">
      <Panel>
        <div className="row wrap gap12">
          <label className="field">Name<input type="search" value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} placeholder="Search" /></label>
          <label className="field">Position<select value={q.pos} onChange={(e) => setQ({ ...q, pos: e.target.value as any })}>{['ANY', 'GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'].map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="field">Min OVR {q.minOvr}<input type="range" min={40} max={95} value={q.minOvr} onChange={(e) => setQ({ ...q, minOvr: Number(e.target.value) })} /></label>
          <label className="field">Max age {q.maxAge}<input type="range" min={16} max={40} value={q.maxAge} onChange={(e) => setQ({ ...q, maxAge: Number(e.target.value) })} /></label>
          <label className="field">Max value {q.maxValue ? fmtMoney(q.maxValue) : 'any'}<input type="range" min={0} max={200e6} step={1e6} value={q.maxValue} onChange={(e) => setQ({ ...q, maxValue: Number(e.target.value) })} /></label>
          <label className="field">Nationality<select value={q.nation} onChange={(e) => setQ({ ...q, nation: e.target.value })}><option value="">Any</option>{Object.values(NATIONS).sort((a, b) => a.name.localeCompare(b.name)).map((n) => <option key={n.code} value={n.code}>{n.name}</option>)}</select></label>
          <label className="row gap4 small" style={{ alignSelf: 'end' }}><input type="checkbox" checked={q.listedOnly} onChange={(e) => setQ({ ...q, listedOnly: e.target.checked })} /> Listed only</label>
          <label className="row gap4 small" style={{ alignSelf: 'end' }}><input type="checkbox" checked={q.freeOnly} onChange={(e) => setQ({ ...q, freeOnly: e.target.checked })} /> Free agents</label>
        </div>
      </Panel>
      <PlayerList ids={results.map((p) => p.id)} onBid={onBid} empty="No players match." />
    </div>
  );
}

export function PlayerList({ ids, onBid, empty }: { ids: number[]; onBid: (p: Player) => void; empty: string }) {
  const state = useGame();
  const toggleShortlist = useStore((s) => s.toggleShortlist);
  const players = ids.map((id) => state.players[id]).filter(Boolean);
  return (
    <Panel tight>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>Pos</th><th>Player</th><th className="num">Age</th><th className="c">OVR</th><th className="c hide-mobile">POT</th><th>Club</th><th className="num">Value</th><th className="num hide-mobile">Asking</th><th className="num hide-mobile">Wage</th><th className="num hide-mobile">Contract</th><th></th></tr></thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className="hover">
                <td><PosTag pos={p.pos} /></td>
                <td><PlayerLink p={p} />{p.transferListed && <span className="pill" style={{ marginLeft: 6, background: '#2a2f3a', color: 'var(--blue)' }}>LISTED</span>}</td>
                <td className="num">{age(state, p)}</td><td className="c"><Ovr v={p.ovr} /></td><td className="c mono muted hide-mobile">{p.pot > p.ovr ? p.pot : '–'}</td>
                <td>{p.clubId !== null ? <ClubName club={state.clubs[p.clubId]} short /> : <span className="muted">Free agent</span>}</td>
                <td className="num">{fmtMoney(p.value)}</td><td className="num hide-mobile">{p.clubId !== null ? fmtMoney(askingPrice(state, p)) : '–'}</td><td className="num hide-mobile">{fmtMoney(p.wage)}</td><td className="num hide-mobile">{p.contractEnd}</td>
                <td className="nowrap"><button className="btn sm" onClick={() => onBid(p)}>{p.clubId === null ? 'Sign' : 'Bid'}</button> <button className="btn sm ghost" title="Shortlist" onClick={() => toggleShortlist(p.id)}>{state.shortlist.includes(p.id) ? '★' : '☆'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {players.length === 0 && <div className="empty">{empty}</div>}
    </Panel>
  );
}

function Recent() {
  const state = useGame();
  return (
    <Panel tight>
      <table className="tbl">
        <thead><tr><th>Date</th><th>Player</th><th>From</th><th>To</th><th className="num">Fee</th></tr></thead>
        <tbody>{state.transfers.slice(0, 80).map((t, i) => { const p = state.players[t.playerId]; return (
          <tr key={i}><td className="tiny dim mono">{formatDay(t.day, { year: false })}</td><td>{p ? <PlayerLink p={p} /> : <span>{flag('')} {t.playerName}</span>}</td><td>{t.fromId !== null ? <ClubName club={state.clubs[t.fromId]} short /> : <span className="muted">Free agent</span>}</td><td><ClubName club={state.clubs[t.toId]} short /></td><td className="num">{t.loan ? 'Loan' : t.fee ? fmtMoney(t.fee) : 'Free'}</td></tr>); })}</tbody>
      </table>
      {state.transfers.length === 0 && <div className="empty">No transfers yet.</div>}
    </Panel>
  );
}
