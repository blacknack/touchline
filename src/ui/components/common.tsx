import React from 'react';
import { Club, Player, Pos } from '../../engine/types';
import { useStore } from '../store';
import { contrastText, clubAccent, ovrColor, posColor, flag, ratingColor } from '../util';

export function ClubBadge({ club, size = '' as '' | 'lg' | 'xl', onClick }: { club: Club; size?: '' | 'lg' | 'xl'; onClick?: () => void }) {
  const bg = clubAccent(club);
  return (
    <span className={`badge-club ${size}`} style={{ background: bg, color: contrastText(bg), border: `2px solid ${club.colors[1]}`, cursor: onClick ? 'pointer' : undefined }} onClick={onClick} title={club.name}>
      {club.short.slice(0, 3)}
    </span>
  );
}

export function ClubName({ club, short = false, badge = true }: { club: Club; short?: boolean; badge?: boolean }) {
  const openClub = useStore((s) => s.openClub);
  return (
    <span className="row gap4 clickable" onClick={() => openClub(club.id)} style={{ display: 'inline-flex' }}>
      {badge && <ClubBadge club={club} />}
      <span className="ellipsis">{short ? club.short : club.name}</span>
    </span>
  );
}

export function PosTag({ pos }: { pos: Pos }) {
  return <span className="pos" style={{ background: posColor(pos) }}>{pos}</span>;
}
export function Ovr({ v }: { v: number }) {
  return <span className="ovr" style={{ background: ovrColor(v) }}>{v}</span>;
}
export function Rating({ v }: { v: number }) {
  return <span className="mono bold" style={{ color: ratingColor(v) }}>{v.toFixed(1)}</span>;
}
export function PlayerLink({ p, showFlag = true }: { p: Player; showFlag?: boolean }) {
  const openPlayer = useStore((s) => s.openPlayer);
  return (
    <span className="clickable semibold" onClick={() => openPlayer(p.id)}>
      {showFlag && <span style={{ marginRight: 5 }}>{flag(p.nat)}</span>}{p.name}
    </span>
  );
}
export function Stars({ v, max = 5 }: { v: number; max?: number }) {
  const full = Math.round(v);
  return <span className="stars">{'★'.repeat(full)}<span style={{ opacity: 0.25 }}>{'★'.repeat(Math.max(0, max - full))}</span></span>;
}
export function Bar({ v, color, h = 6 }: { v: number; color: string; h?: number }) {
  return <div className="bar" style={{ height: h }}><i style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} /></div>;
}
export function Modal({ title, onClose, children, width }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="mh"><h2>{title}</h2><button className="btn sm ghost" onClick={onClose}>✕</button></div>
        <div className="mb">{children}</div>
      </div>
    </div>
  );
}
export function Panel({ title, right, children, tight, style }: { title?: string; right?: React.ReactNode; children: React.ReactNode; tight?: boolean; style?: React.CSSProperties }) {
  return (
    <div className={`panel ${tight ? 'tight' : ''}`} style={style}>
      {title && <div className="ph"><h3>{title}</h3>{right}</div>}
      <div className="pb">{children}</div>
    </div>
  );
}
export function FormDots({ form }: { form: string[] }) {
  return <span>{form.map((f, i) => <span key={i} className="form-dot" style={{ background: f === 'W' ? '#5ee39a' : f === 'D' ? '#c9d1d9' : '#f0716b' }}>{f}</span>)}</span>;
}
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return <div className="tabs">{tabs.map((t) => <button key={t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>;
}
export function Seg<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return <div className="seg">{options.map((o) => <button key={o.id} className={value === o.id ? 'active' : ''} onClick={() => onChange(o.id)}>{o.label}</button>)}</div>;
}
