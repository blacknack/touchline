import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { MatchEvent, Player } from '../../engine/types';
import { MatchSim, Side } from '../../engine/match/engine';
import { contrastText } from '../util';
import { MatchViz, L, W } from '../live2d/viz';

// Aerial 2D match view. The heavy lifting (agents, ball physics, passing sequences, runs,
// pressing, set pieces) lives in live2d/viz.ts; this component owns the canvas + rAF loop and
// compresses time: one engine minute ≈ 10–14 football-seconds, played at 3× (1×) up to 15× (8×).
export interface Pitch2DHandle { push: (events: MatchEvent[], attacking: Side, minuteLabel: string) => void; busy: () => boolean; }

interface Props { sim: MatchSim; players: Record<number, Player>; speed: number; running: boolean; homeColor: string; awayColor: string; homeShort: string; awayShort: string; showNames?: boolean; onEvent?: (e: MatchEvent) => void; onMinute?: (m: string) => void; }

const RATE: Record<number, number> = { 1: 3, 2: 4.8, 3: 7.8, 4: 15 };

export const Pitch2D = forwardRef<Pitch2DHandle, Props>(function Pitch2D({ sim, players, speed, running, homeColor, awayColor, homeShort, awayShort, showNames, onEvent, onMinute }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<MatchViz | null>(null);
  const live = useRef({ speed, running, showNames: !!showNames, homeColor, awayColor, homeShort, awayShort, onEvent, onMinute });
  live.current = { speed, running, showNames: !!showNames, homeColor, awayColor, homeShort, awayShort, onEvent, onMinute };
  if (!vizRef.current || vizRef.current.sim !== sim) {
    const v = new MatchViz(sim, players);
    v.onEvent = (e) => live.current.onEvent?.(e);
    v.onMinute = (m) => live.current.onMinute?.(m);
    vizRef.current = v;
  }

  useImperativeHandle(ref, () => ({
    push: (events, attacking, minuteLabel) => vizRef.current?.enqueueMinute(events, attacking, minuteLabel),
    busy: () => vizRef.current?.busy() ?? false,
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dtWall = Math.min(0.05, (now - last) / 1000); last = now;
      const viz = vizRef.current!;
      const { speed: spd, running: run, showNames: names, homeColor: hc, awayColor: ac, homeShort: hs, awayShort: as } = live.current;
      // while paused, only let queued set pieces / stoppages finish, then freeze the picture
      if (run || viz.busy()) {
        const rate = RATE[spd] ?? 7.8;
        let dtSim = dtWall * rate;
        while (dtSim > 0) { const step = Math.min(0.05, dtSim); viz.update(step); dtSim -= step; }
      }
      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.clientWidth || 600, ch = Math.round(cw * (W + 8) / (L + 8));
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); canvas.style.height = ch + 'px'; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      viz.draw(ctx, cw, ch, { home: hc, away: ac, homeText: contrastText(hc), awayText: contrastText(ac), homeShort: hs, awayShort: as }, names);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sim]);

  return <canvas ref={canvasRef} style={{ width: '100%', display: 'block', borderRadius: 12 }} />;
});
