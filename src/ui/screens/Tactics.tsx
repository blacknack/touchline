import React, { useState } from 'react';
import { useGame, useStore } from '../store';
import { Panel, PosTag, Ovr, Seg } from '../components/common';
import { Pitch } from '../components/Pitch';
import { FORMATIONS, FORMATION_NAMES, pickLineup, isAvailable, repairLineup } from '../../engine/tactics';
import { ovrAtPosition } from '../../engine/attributes';
import { Lineup, Tactic, Pos } from '../../engine/types';
import { conditionColor, surname } from '../util';

export function TacticsEditor({ inMatch = false }: { inMatch?: boolean }) {
  const state = useGame();
  const setLineup = useStore((s) => s.setLineup);
  const setTactic = useStore((s) => s.setTactic);
  const club = state.clubs[state.manager.clubId];
  const compId = state.pendingUserFixture !== null ? state.fixtures[state.pendingUserFixture].compId : club.leagueId ?? 'ALL';
  const [sel, setSel] = useState<number>(-1);          // selected slot index (0-10 starters, 100+ bench)
  const lu = club.lineup;
  const players = club.players.map((id) => state.players[id]).filter(Boolean);
  const inLineup = new Set([...lu.starters, ...lu.bench].filter((x): x is number => x !== null));
  const others = players.filter((p) => !inLineup.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  const slots = FORMATIONS[club.tactic.formation];

  const update = (fn: (l: Lineup) => void) => { const copy: Lineup = { ...lu, starters: lu.starters.slice(), bench: lu.bench.slice() }; fn(copy); setLineup(copy); };
  const updateT = (patch: Partial<Tactic>) => setTactic({ ...club.tactic, ...patch });

  const place = (pid: number) => {
    if (sel < 0) return;
    update((l) => {
      // remove pid from wherever it is
      const si = l.starters.indexOf(pid), bi = l.bench.indexOf(pid);
      const target = sel >= 100 ? l.bench[sel - 100] : l.starters[sel];
      if (si >= 0) l.starters[si] = target; else if (bi >= 0) l.bench[bi] = target;
      if (sel >= 100) l.bench[sel - 100] = pid; else l.starters[sel] = pid;
    });
    setSel(-1);
  };
  const swapSlots = (a: number, b: number) => update((l) => { const t = l.starters[a]; l.starters[a] = l.starters[b]; l.starters[b] = t; });
  const selectSlot = (i: number) => {
    if (sel === i) { setSel(-1); return; }
    if (sel >= 0) { // swap
      update((l) => {
        const get = (k: number) => (k >= 100 ? l.bench[k - 100] : l.starters[k]);
        const put = (k: number, v: number | null) => { if (k >= 100) l.bench[k - 100] = v; else l.starters[k] = v; };
        const a = get(sel), b = get(i); put(sel, b); put(i, a);
      });
      setSel(-1);
    } else setSel(i);
  };
  const removeFromSlot = (i: number) => update((l) => { if (i >= 100) l.bench[i - 100] = null; else l.starters[i] = null; });
  const autoPick = () => { setLineup(pickLineup(club, state.players, compId)); setSel(-1); };
  const changeFormation = (f: string) => { updateT({ formation: f }); setTimeout(() => { const st = useStore.getState().state; if (!st) return; const c = st.clubs[club.id]; setLineup(repairLineup(c, st.players, compId)); }, 0); };

  const unavailable = (id: number) => !isAvailable(state.players[id], compId);
  const xiOvr = lu.starters.reduce((acc: number, id, i) => acc + (id !== null && state.players[id] ? ovrAtPosition(state.players[id], slots[i].pos) : 0), 0) / 11;

  const selLabel = sel < 0 ? null : sel >= 100 ? `Bench ${sel - 99}` : `${slots[sel].pos}`;

  return (
    <div className="grid" style={{ gridTemplateColumns: inMatch ? '1fr 1fr' : '1.1fr 1fr' }}>
      <div className="col gap12">
        <div className="row wrap between">
          <div className="row gap4">
            <select value={club.tactic.formation} onChange={(e) => changeFormation(e.target.value)}>{FORMATION_NAMES.map((f) => <option key={f}>{f}</option>)}</select>
            <button className="btn sm" onClick={autoPick}>Auto pick</button>
          </div>
          <div className="small muted">XI rating <b className="mono" style={{ color: 'var(--text)' }}>{xiOvr.toFixed(1)}</b>{selLabel && <span className="accent"> · selected: {selLabel} — click a player to place</span>}</div>
        </div>
        <Pitch club={club} players={state.players} formation={club.tactic.formation} starters={lu.starters} selected={sel} onSelectSlot={selectSlot} onSwap={swapSlots}
          extra={(id) => { const p = state.players[id]; const i = lu.starters.indexOf(id); return <>{ovrAtPosition(p, slots[i].pos)} · <span style={{ color: conditionColor(p.condition) }}>{Math.round(p.condition)}%</span>{unavailable(id) ? ' ⛔' : ''}</>; }} />
        <Panel title="Instructions">
          <div className="col gap12">
            <Row label="Mentality"><Seg options={[{ id: 'very-defensive', label: 'V.Def' }, { id: 'defensive', label: 'Def' }, { id: 'balanced', label: 'Balanced' }, { id: 'attacking', label: 'Att' }, { id: 'very-attacking', label: 'V.Att' }]} value={club.tactic.mentality} onChange={(v) => updateT({ mentality: v })} /></Row>
            <Row label="Pressing"><Seg options={[{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }]} value={club.tactic.pressing} onChange={(v) => updateT({ pressing: v })} /></Row>
            <Row label="Defensive line"><Seg options={[{ id: 'deep', label: 'Deep' }, { id: 'normal', label: 'Normal' }, { id: 'high', label: 'High' }]} value={club.tactic.line} onChange={(v) => updateT({ line: v })} /></Row>
            <Row label="Tempo"><Seg options={[{ id: 'slow', label: 'Slow' }, { id: 'normal', label: 'Normal' }, { id: 'fast', label: 'Fast' }]} value={club.tactic.tempo} onChange={(v) => updateT({ tempo: v })} /></Row>
            <Row label="Width"><Seg options={[{ id: 'narrow', label: 'Narrow' }, { id: 'normal', label: 'Normal' }, { id: 'wide', label: 'Wide' }]} value={club.tactic.width} onChange={(v) => updateT({ width: v })} /></Row>
            <Row label="Passing"><Seg options={[{ id: 'short', label: 'Short' }, { id: 'mixed', label: 'Mixed' }, { id: 'direct', label: 'Direct' }]} value={club.tactic.passing} onChange={(v) => updateT({ passing: v })} /></Row>
            <Row label="Extras">
              <label className="row gap4 small"><input type="checkbox" checked={club.tactic.counter} onChange={(e) => updateT({ counter: e.target.checked })} /> Counter-attack</label>
              <label className="row gap4 small"><input type="checkbox" checked={club.tactic.timeWasting} onChange={(e) => updateT({ timeWasting: e.target.checked })} /> Waste time when ahead</label>
            </Row>
          </div>
        </Panel>
      </div>
      <div className="col gap12">
        <Panel title="Bench" tight right={<span className="tiny muted">{lu.bench.filter(Boolean).length}/9</span>}>
          <div className="lineup-list" style={{ padding: '4px 12px' }}>
            {lu.bench.map((id, i) => {
              const p = id !== null ? state.players[id] : null;
              const k = 100 + i;
              return (
                <div key={i} className={`p clickable`} style={{ background: sel === k ? '#243040' : undefined }} onClick={() => selectSlot(k)}>
                  <span className="num">{i + 1}</span>
                  {p ? <><PosTag pos={p.pos} /><span className="grow semibold">{surname(p.name)}{unavailable(p.id) ? ' ⛔' : ''}</span><span className="tiny" style={{ color: conditionColor(p.condition) }}>{Math.round(p.condition)}%</span><Ovr v={p.ovr} /><button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); removeFromSlot(k); }}>✕</button></> : <span className="dim">— empty —</span>}
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Not selected" tight right={<span className="tiny muted">{sel >= 0 ? 'click to place' : 'select a slot first'}</span>}>
          <div className="lineup-list" style={{ padding: '4px 12px', maxHeight: 360, overflow: 'auto' }}>
            {others.map((p) => (
              <div key={p.id} className="p clickable" style={{ opacity: unavailable(p.id) ? 0.5 : 1 }} onClick={() => (sel >= 0 ? place(p.id) : useStore.getState().openPlayer(p.id))}>
                <span className="num">{p.number}</span><PosTag pos={p.pos} /><span className="grow semibold">{p.name}{p.injury ? ' 🩹' : ''}{Object.values(p.suspension).some((v) => v > 0) ? ' 🟥' : ''}</span>
                {sel >= 0 && sel < 100 && <span className="tiny muted">{ovrAtPosition(p, slots[sel].pos as Pos)} at {slots[sel].pos}</span>}
                <span className="tiny" style={{ color: conditionColor(p.condition) }}>{Math.round(p.condition)}%</span><Ovr v={p.ovr} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Roles">
          <div className="col gap4">
            {(['captain', 'penaltyTaker', 'freeKickTaker', 'cornerTaker'] as const).map((k) => (
              <label key={k} className="row between small"><span className="muted">{k === 'captain' ? 'Captain' : k === 'penaltyTaker' ? 'Penalties' : k === 'freeKickTaker' ? 'Free kicks' : 'Corners'}</span>
                <select value={lu[k] ?? ''} onChange={(e) => update((l) => { l[k] = e.target.value ? Number(e.target.value) : null; })}>
                  <option value="">Auto</option>
                  {lu.starters.filter((x): x is number => x !== null).map((id) => <option key={id} value={id}>{state.players[id].name}</option>)}
                </select></label>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="row wrap between"><span className="small muted" style={{ minWidth: 100 }}>{label}</span><div className="row wrap gap12">{children}</div></div>;
}

export function Tactics() { return <TacticsEditor />; }
