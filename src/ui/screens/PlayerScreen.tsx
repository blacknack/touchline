import React, { useState } from 'react';
import { useGame, useStore } from '../store';
import { Panel, PosTag, Ovr, ClubName, Modal, Bar } from '../components/common';
import { age, fmtMoney, attrColor, moraleLabel, conditionColor, flag, statAvg } from '../util';
import { ATTR_GROUPS, ATTR_LABEL } from '../../engine/attributes';
import { nationName } from '../../engine/data/nations';
import { contractDemand } from '../../engine/transfers';
import { BidModal } from './Transfers';

export function PlayerScreen() {
  const state = useGame();
  const id = useStore((s) => s.selectedPlayer);
  const back = useStore((s) => s.back);
  const { toggleList, toggleShortlist, release, renew, showToast } = useStore.getState();
  const p = id !== null ? state.players[id] : null;
  const [renewOpen, setRenewOpen] = useState(false);
  const [bid, setBid] = useState(false);
  if (!p) return <Panel><div className="empty">Player not found (he may have retired).</div><button className="btn" onClick={back}>Back</button></Panel>;
  const mine = p.clubId === state.manager.clubId;
  const club = p.clubId !== null ? state.clubs[p.clubId] : null;
  const a = age(state, p);
  const comps = Object.keys(p.stats).filter((k) => k !== 'ALL' && state.competitions[k]);
  const groups = p.pos === 'GK' ? ATTR_GROUPS.filter((g) => g.name !== 'Technical').concat(ATTR_GROUPS.filter((g) => g.name === 'Technical')) : ATTR_GROUPS.filter((g) => g.name !== 'Goalkeeping');
  return (
    <div className="col gap12">
      <div className="row gap4"><button className="btn sm ghost" onClick={back}>← Back</button></div>
      <div className="row gap16 wrap" style={{ alignItems: 'flex-start' }}>
        <div className="col grow" style={{ gap: 4 }}>
          <h1>{flag(p.nat)} {p.name} <span className="dim" style={{ fontSize: 16 }}>#{p.number}</span></h1>
          <div className="row gap12 wrap small">
            <PosTag pos={p.pos} />{p.altPos.map((x) => <PosTag key={x} pos={x} />)}
            <span className="muted">{a} years · {nationName(p.nat)} · {p.preferredFoot === 'L' ? 'left' : 'right'}-footed</span>
            {club ? <ClubName club={club} /> : <span className="muted">Free agent</span>}
            {p.loanFrom !== null && <span className="muted">on loan from {state.clubs[p.loanFrom]?.name}</span>}
          </div>
          <div className="row gap12 wrap small mt8">
            <div className="stat-tile"><div className="v"><Ovr v={p.ovr} /></div><div className="l">Overall</div></div>
            <div className="stat-tile"><div className="v mono">{p.pot > p.ovr ? p.pot : '–'}</div><div className="l">Potential</div></div>
            <div className="stat-tile"><div className="v">{fmtMoney(p.value)}</div><div className="l">Value</div></div>
            <div className="stat-tile"><div className="v">{fmtMoney(p.wage)}</div><div className="l">Wage / wk</div></div>
            <div className="stat-tile"><div className="v">{p.contractEnd}</div><div className="l">Contract until</div></div>
          </div>
        </div>
        <div className="col gap4">
          {mine && <>
            <button className="btn primary" onClick={() => setRenewOpen(true)}>Offer new contract</button>
            <button className="btn" onClick={() => toggleList(p.id)}>{p.transferListed ? 'Remove from transfer list' : 'Transfer list'}</button>
            <button className="btn danger" onClick={() => { if (confirm(`Release ${p.name}? Remaining contract will be partly paid off.`)) { release(p.id); back(); } }}>Release</button>
          </>}
          {!mine && <>
            <button className="btn primary" onClick={() => setBid(true)}>{p.clubId === null ? 'Sign free agent' : 'Make a bid'}</button>
            <button className="btn" onClick={() => toggleShortlist(p.id)}>{state.shortlist.includes(p.id) ? '★ Shortlisted' : '☆ Shortlist'}</button>
          </>}
        </div>
      </div>
      <div className="grid grid2">
        <Panel title="Attributes">
          <div className="attrs">
            {groups.map((g) => (
              <div key={g.name}>
                <div className="tiny dim bold mb8" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{g.name}</div>
                {g.keys.map((k) => <div key={k} className="attr-row"><span className="n">{ATTR_LABEL[k]}</span><div className="bar" style={{ width: 70 }}><i style={{ width: `${p.attrs[k] * 5}%`, background: attrColor(p.attrs[k]) }} /></div><span className="v" style={{ color: attrColor(p.attrs[k]) }}>{p.attrs[k]}</span></div>)}
              </div>
            ))}
          </div>
        </Panel>
        <div className="col gap12">
          <Panel title="Condition">
            <div className="kv small">
              <span className="k">Fitness</span><span className="row gap4"><div style={{ width: 90 }}><Bar v={p.condition} color={conditionColor(p.condition)} /></div>{Math.round(p.condition)}%</span>
              <span className="k">Match sharpness</span><span className="row gap4"><div style={{ width: 90 }}><Bar v={p.sharpness} color="#8fd3ff" /></div>{Math.round(p.sharpness)}%</span>
              <span className="k">Morale</span><span>{moraleLabel(p.morale)}{p.unhappy > 50 ? ' · unhappy, wants to leave' : ''}</span>
              <span className="k">Injury</span><span>{p.injury ? <span className="red">{p.injury.type} — {p.injury.daysLeft} days</span> : 'fit'}</span>
              <span className="k">Suspension</span><span>{Object.entries(p.suspension).filter(([, v]) => v > 0).map(([k, v]) => `${state.competitions[k]?.short ?? k}: ${v} match${v > 1 ? 'es' : ''}`).join(', ') || 'none'}</span>
              <span className="k">Form (last 5)</span><span className="mono">{p.form.length ? p.form.map((r) => r.toFixed(1)).join(' · ') : '–'}</span>
            </div>
          </Panel>
          <Panel title="This season" tight>
            <table className="tbl"><thead><tr><th>Comp</th><th className="num">Apps</th><th className="num">Gls</th><th className="num">Ast</th><th className="num">Y/R</th><th className="num">CS</th><th className="num">Avg</th></tr></thead>
              <tbody>
                {comps.map((k) => { const s = p.stats[k]; return <tr key={k}><td>{state.competitions[k].short}</td><td className="num">{s.apps}</td><td className="num">{s.goals}</td><td className="num">{s.assists}</td><td className="num">{s.yellows}/{s.reds}</td><td className="num">{s.cleanSheets}</td><td className="num">{(s.ratingSum / s.apps).toFixed(2)}</td></tr>; })}
                {p.stats['ALL'] && <tr className="bold"><td>Total</td><td className="num">{p.stats['ALL'].apps}</td><td className="num">{p.stats['ALL'].goals}</td><td className="num">{p.stats['ALL'].assists}</td><td className="num">{p.stats['ALL'].yellows}/{p.stats['ALL'].reds}</td><td className="num">{p.stats['ALL'].cleanSheets}</td><td className="num">{statAvg(p)}</td></tr>}
              </tbody></table>
            {!p.stats['ALL'] && <div className="empty">No appearances yet.</div>}
          </Panel>
          <Panel title="Career" tight>
            <table className="tbl"><thead><tr><th>Season</th><th>Club</th><th className="num">Apps</th><th className="num">Gls</th><th className="num">Ast</th><th className="num">Avg</th></tr></thead>
              <tbody>{p.career.slice().reverse().map((c, i) => <tr key={i}><td>{c.season}</td><td>{c.clubName}</td><td className="num">{c.apps}</td><td className="num">{c.goals}</td><td className="num">{c.assists}</td><td className="num">{c.avgRating.toFixed(2)}</td></tr>)}</tbody></table>
            {p.career.length === 0 && <div className="empty">Career history builds up season by season.</div>}
          </Panel>
        </div>
      </div>
      {renewOpen && <RenewModal pid={p.id} onClose={() => setRenewOpen(false)} onDone={(ok, msg) => { showToast(msg); if (ok) setRenewOpen(false); }} renew={renew} />}
      {bid && <BidModal p={p} onClose={() => setBid(false)} />}
    </div>
  );
}

function RenewModal({ pid, onClose, onDone, renew }: { pid: number; onClose: () => void; onDone: (ok: boolean, msg: string) => void; renew: (id: number, wage: number, years: number) => { ok: boolean; msg: string } }) {
  const state = useGame();
  const p = state.players[pid];
  const d = contractDemand(state, p);
  const [wage, setWage] = useState(d.wage);
  const [years, setYears] = useState(d.years);
  return (
    <Modal title={`New contract for ${p.name}`} onClose={onClose}>
      <div className="small muted mb8">Current: {fmtMoney(p.wage)}/wk until {p.contractEnd}. He is asking for around <b>{fmtMoney(d.wage)}/wk</b> on a {d.years}-year deal.</div>
      <label className="field mb8">Wage: <b className="mono" style={{ color: 'var(--text)' }}>{fmtMoney(wage)}</b><input type="range" min={500} max={Math.max(d.wage * 2, 10000)} step={250} value={wage} onChange={(e) => setWage(Number(e.target.value))} /></label>
      <label className="field mb16">Years: {years}<input type="range" min={1} max={5} value={years} onChange={(e) => setYears(Number(e.target.value))} /></label>
      <div className="row gap4"><button className="btn primary" onClick={() => { const r = renew(pid, wage, years); onDone(r.ok, r.msg); }}>Offer</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}
