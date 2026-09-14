import React, { useMemo, useState } from 'react';
import { useGame } from '../store';
import { Panel, PlayerLink, ClubName, PosTag, Tabs } from '../components/common';
import { Player } from '../../engine/types';
import { LEAGUE_META } from '../../engine/season';

type Cat = 'goals' | 'assists' | 'rating' | 'cleanSheets' | 'motm' | 'cards';

export function Stats() {
  const state = useGame();
  const [scope, setScope] = useState<string>('ALL');
  const [cat, setCat] = useState<Cat>('goals');
  const scopes = [{ id: 'ALL', label: 'All competitions' }, ...Object.keys(LEAGUE_META).map((id) => ({ id, label: LEAGUE_META[id].name })), { id: 'UCL', label: 'Champions League' }, { id: 'UEL', label: 'Europa League' }, { id: 'UECL', label: 'Conference League' }];
  const list = useMemo(() => {
    const ps = Object.values(state.players).filter((p) => p.clubId !== null && p.stats[scope]);
    const val = (p: Player) => { const s = p.stats[scope]; switch (cat) { case 'goals': return s.goals; case 'assists': return s.assists; case 'rating': return s.apps >= 5 ? s.ratingSum / s.apps : 0; case 'cleanSheets': return p.pos === 'GK' ? s.cleanSheets : 0; case 'motm': return s.motm; case 'cards': return s.yellows + s.reds * 3; } };
    return ps.map((p) => ({ p, v: val(p) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 40);
  }, [state.players, scope, cat, state.day]);
  const fmt = (v: number) => (cat === 'rating' ? v.toFixed(2) : String(v));
  return (
    <div className="col gap12">
      <div className="row wrap gap12">
        <select value={scope} onChange={(e) => setScope(e.target.value)}>{scopes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      </div>
      <Tabs tabs={[{ id: 'goals', label: 'Goals' }, { id: 'assists', label: 'Assists' }, { id: 'rating', label: 'Avg rating' }, { id: 'cleanSheets', label: 'Clean sheets' }, { id: 'motm', label: 'MOTM' }, { id: 'cards', label: 'Discipline' }]} value={cat} onChange={setCat} />
      <Panel tight>
        <table className="tbl">
          <thead><tr><th>#</th><th>Pos</th><th>Player</th><th>Club</th><th className="num">Apps</th><th className="num">{cat === 'cards' ? 'Y/R' : cat}</th></tr></thead>
          <tbody>{list.map((x, i) => { const s = x.p.stats[scope]; return <tr key={x.p.id}><td className="num">{i + 1}</td><td><PosTag pos={x.p.pos} /></td><td><PlayerLink p={x.p} /></td><td><ClubName club={state.clubs[x.p.clubId!]} short /></td><td className="num">{s.apps}</td><td className="num bold">{cat === 'cards' ? `${s.yellows}/${s.reds}` : fmt(x.v)}</td></tr>; })}</tbody>
        </table>
        {list.length === 0 && <div className="empty">No data yet.</div>}
      </Panel>
    </div>
  );
}
