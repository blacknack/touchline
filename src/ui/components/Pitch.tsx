import React, { useRef, useState } from 'react';
import { Club, Player, Pos } from '../../engine/types';
import { FORMATIONS } from '../../engine/tactics';
import { ovrAtPosition } from '../../engine/attributes';
import { clubAccent, contrastText, surname, ovrColor } from '../util';

interface Props {
  club: Club;
  players: Record<number, Player>;
  formation: string;
  starters: (number | null)[];
  selected: number | null;              // selected slot index or -1 for none
  onSelectSlot: (slot: number) => void;
  onSwap?: (a: number, b: number) => void;
  extra?: (id: number) => React.ReactNode;   // e.g. condition/rating label
  small?: boolean;
  compId?: string;
}

export function Pitch({ club, players, formation, starters, selected, onSelectSlot, onSwap, extra }: Props) {
  const slots = FORMATIONS[formation] ?? FORMATIONS['4-3-3'];
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ slot: number; x: number; y: number } | null>(null);
  const accent = clubAccent(club);
  const fg = contrastText(accent);

  const pos = (i: number) => ({ left: `${slots[i].x}%`, top: `${100 - slots[i].y}%` });
  const nearest = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * 100, py = 100 - ((clientY - r.top) / r.height) * 100;
    let best = -1, bd = 1e9;
    slots.forEach((s, i) => { const d = (s.x - px) ** 2 + (s.y - py) ** 2; if (d < bd) { bd = d; best = i; } });
    return bd < 120 ? best : -1;
  };

  return (
    <div className="pitch" ref={ref}
      onPointerMove={(e) => { if (drag) setDrag({ ...drag, x: e.clientX, y: e.clientY }); }}
      onPointerUp={(e) => { if (drag) { const t = nearest(e.clientX, e.clientY); if (t >= 0 && t !== drag.slot && onSwap) onSwap(drag.slot, t); setDrag(null); } }}
      onPointerLeave={() => setDrag(null)}>
      <div className="lines">
        <div style={{ left: '4%', right: '4%', top: '3%', bottom: '3%', borderRadius: 4 }} />
        <div style={{ left: '4%', right: '4%', top: '50%', height: 0 }} />
        <div style={{ left: '50%', top: '50%', width: '22%', aspectRatio: '1', transform: 'translate(-50%,-50%)', borderRadius: '50%' }} />
        <div style={{ left: '22%', right: '22%', top: '3%', height: '15%' }} />
        <div style={{ left: '22%', right: '22%', bottom: '3%', height: '15%' }} />
        <div style={{ left: '37%', right: '37%', top: '3%', height: '5.5%' }} />
        <div style={{ left: '37%', right: '37%', bottom: '3%', height: '5.5%' }} />
      </div>
      {slots.map((s, i) => {
        const id = starters[i];
        const p = id !== null ? players[id] : null;
        const oop = p ? ovrAtPosition(p, s.pos as Pos) < p.ovr - 6 : false;
        const dragging = drag?.slot === i;
        return (
          <div key={i} className={`slot ${selected === i ? 'selected' : ''} ${p ? '' : 'empty'} ${oop ? 'oop' : ''} ${dragging ? 'dragging' : ''}`} style={pos(i)}
            onPointerDown={(e) => { if (p && onSwap) { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); setDrag({ slot: i, x: e.clientX, y: e.clientY }); } }}
            onClick={() => onSelectSlot(i)}>
            <div className="kit" style={{ background: p ? accent : undefined, color: fg }}>{p ? p.number || '' : s.pos}</div>
            <div className="nm">{p ? surname(p.name) : s.pos}</div>
            {p && <div className="sub" style={{ color: ovrColor(ovrAtPosition(p, s.pos as Pos)) }}>{extra ? extra(p.id) : <>{s.pos} · {ovrAtPosition(p, s.pos as Pos)}</>}</div>}
          </div>
        );
      })}
    </div>
  );
}
