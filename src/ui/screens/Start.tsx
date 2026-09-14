import React, { useEffect, useMemo, useState } from 'react';
import { useStore, SaveMeta } from '../store';
import { buildWorld } from '../../engine/world';
import { ClubBadge, Stars } from '../components/common';
import { Club } from '../../engine/types';
import { fmtMoney, formatDay } from '../util';
import { LEAGUE_META } from '../../engine/season';
import { SaveModal } from '../components/SaveModal';

const LEAGUES = ['ENG1', 'ESP1', 'GER1', 'ITA1', 'FRA1'];

export function Start() {
  const newGame = useStore((s) => s.newGame);
  const load = useStore((s) => s.load);
  const listSaves = useStore((s) => s.listSaves);
  const deleteSave = useStore((s) => s.deleteSave);
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [mode, setMode] = useState<'menu' | 'new'>('menu');
  const [league, setLeague] = useState('ENG1');
  const [clubId, setClubId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const storageOk = useStore((s) => s.storageOk);
  const probeStorage = useStore((s) => s.probeStorage);
  const world = useMemo(() => buildWorld(1, 0), []);
  useEffect(() => { void probeStorage().then(() => listSaves().then(setSaves)); }, [listSaves, probeStorage]);
  const clubs = Object.values(world.clubs).filter((c) => c.leagueId === league).sort((a, b) => b.reputation - a.reputation);
  const sel = clubId !== null ? world.clubs[clubId] : null;

  const start = () => {
    if (!clubId) return;
    setLoading(true);
    setTimeout(() => { newGame(Math.floor(Math.random() * 1e9), clubId, name.trim() || 'The Gaffer'); setLoading(false); }, 30);
  };

  return (
    <div className="start">
      <div className="logo">Touchline<span>.</span></div>
      <div className="muted" style={{ marginTop: 4, marginBottom: 28 }}>Football management · 2026/27 · Five leagues, every cup, all of Europe</div>
      {mode === 'menu' && (
        <div className="col" style={{ width: '100%', maxWidth: 520 }}>
          <button className="btn primary lg block" onClick={() => setMode('new')}>New career</button>
          <button className="btn lg block" onClick={() => setLoadOpen(true)}>Load game{saves.length ? ` (${saves.length} saved)` : ''}</button>
          {storageOk === false && <div className="small red" style={{ textAlign: 'center' }}>Browser storage is blocked here, so saves won't persist between visits — use Export/Import in the Load menu.</div>}
          {saves.length > 0 && <div className="panel" style={{ marginTop: 8 }}>
            <div className="ph"><h3>Saved games</h3></div>
            {saves.map((s) => (
              <div key={s.slot} className="row between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
                <div><div className="bold">{s.club}</div><div className="small muted">{s.manager} · {s.season} · {formatDay(s.day)}</div></div>
                <div className="row gap4"><button className="btn sm primary" onClick={() => void load(s.slot)}>Load</button><button className="btn sm danger" onClick={() => { if (confirm('Delete this save?')) void deleteSave(s.slot).then(() => listSaves().then(setSaves)); }}>✕</button></div>
              </div>
            ))}
          </div>}
          {loadOpen && <SaveModal mode="load" onClose={() => { setLoadOpen(false); void listSaves().then(setSaves); }} />}
          <div className="tiny dim" style={{ textAlign: 'center', marginTop: 20 }}>Saves are stored in this browser. Squad data reflects the 2026/27 season as best known and can be edited in <code>src/engine/data</code>.</div>
        </div>
      )}
      {mode === 'new' && (
        <div className="col gap16" style={{ width: '100%', maxWidth: 1100 }}>
          <div className="row wrap between">
            <div className="seg">{LEAGUES.map((l) => <button key={l} className={league === l ? 'active' : ''} onClick={() => { setLeague(l); setClubId(null); }}>{LEAGUE_META[l].name}</button>)}</div>
            <button className="btn ghost" onClick={() => setMode('menu')}>← Back</button>
          </div>
          <div className="club-grid">
            {clubs.map((c) => <ClubCard key={c.id} club={c} selected={clubId === c.id} onClick={() => setClubId(c.id)} />)}
          </div>
          {sel && (
            <div className="panel">
              <div className="pb row wrap gap16" style={{ alignItems: 'center' }}>
                <ClubBadge club={sel} size="xl" />
                <div className="col grow" style={{ gap: 2 }}>
                  <h2>{sel.name}</h2>
                  <div className="small muted">{sel.stadium} · {sel.capacity.toLocaleString()} · Board expects: <b className="accent">{sel.expectation}</b> · Budget {fmtMoney(sel.transferBudget)}</div>
                  <div className="small muted">Squad: {sel.players.length} players · avg {Math.round(sel.players.map((id) => world.players[id].ovr).sort((a, b) => b - a).slice(0, 11).reduce((s, v) => s + v, 0) / 11)} (best XI) · {sel.generatedSquad ? 'generated squad' : 'real squad'}</div>
                </div>
                <label className="field">Your name<input type="text" value={name} placeholder="Manager name" onChange={(e) => setName(e.target.value)} /></label>
                <button className="btn primary lg" disabled={loading} onClick={start}>{loading ? 'Building world…' : `Manage ${sel.short}`}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClubCard({ club, selected, onClick }: { club: Club; selected: boolean; onClick: () => void }) {
  return (
    <div className={`club-card ${selected ? 'selected' : ''}`} onClick={onClick}>
      <ClubBadge club={club} size="lg" />
      <div className="col" style={{ gap: 1, minWidth: 0 }}>
        <div className="bold ellipsis">{club.name}</div>
        <Stars v={club.reputation / 20} />
        <div className="tiny muted">{club.expectation}</div>
      </div>
    </div>
  );
}
