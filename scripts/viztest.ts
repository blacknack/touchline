// Headless stress test of the organic 2D director: runs full matches minute by minute through
// MatchViz.update() and checks for NaNs, players off the pitch, stalled plays, teleports (ball or
// player jumps), and that every engine event is committed to the UI exactly once and in order.
import { buildWorld } from '../src/engine/world';
import { pickLineup, aiTactic, squadStrength } from '../src/engine/tactics';
import { MatchSim } from '../src/engine/match/engine';
import { Fixture, MatchEvent } from '../src/engine/types';
import { RNG } from '../src/engine/rng';
import { MatchViz, L, W } from '../src/ui/live2d/viz';

const w = buildWorld(42, 0);
const pl = Object.values(w.clubs).filter((c) => c.leagueId === 'ENG1');
const rng = new RNG(11);
const N = Number(process.argv[2] ?? 6);
const strength = new Map<number, number>();
for (const c of pl) strength.set(c.id, squadStrength(c, w.players));
let problems = 0;
const stats = { minutes: 0, simSecs: 0, passes: 0, maxSpeed: 0, offPitch: 0, nan: 0, longPlays: 0, goals: 0, crowdSamples: 0, crowded: 0, ballJumps: 0, playerJumps: 0, committed: 0, engineEvents: 0, uncommitted: 0, dupes: 0, outOfOrder: 0, stuck: 0 };
const jumpsBy: Record<string, number> = {};
for (let i = 0; i < N; i++) {
  const h = rng.pick(pl); let a = rng.pick(pl); while (a.id === h.id) a = rng.pick(pl);
  const fx: Fixture = { id: i, compId: 'ENG1', stage: 0, stageName: 'R', homeId: h.id, awayId: a.id, day: 0, leg: 0, tieId: null, neutral: false, played: false, result: null, knockout: i % 3 === 2 };
  const sim = new MatchSim(w.players, h, a, fx, {
    seed: i * 31 + 5, homeLineup: pickLineup(h, w.players, 'ENG1'), awayLineup: pickLineup(a, w.players, 'ENG1'),
    homeTactic: aiTactic(h, w.players, strength.get(h.id)! - strength.get(a.id)!, () => rng.next()), awayTactic: aiTactic(a, w.players, strength.get(a.id)! - strength.get(h.id)!, () => rng.next()),
    knockout: i % 3 === 2, neutral: false, userSide: null, autoSubs: true,
  });
  const viz = new MatchViz(sim, w.players);
  const committed: MatchEvent[] = [];
  const seen = new Set<MatchEvent>();
  viz.debug = (m) => console.log('  dbg', m);
  viz.onEvent = (e) => { if (seen.has(e)) stats.dupes++; seen.add(e); committed.push(e); };
  let lastCarrier: number | null = null;
  let lastBall = { ...viz.ball.pos };
  let still = 0;
  const lastPos = new Map<number, { x: number; y: number }>();
  const step = () => {
    const before = viz.cur?.kind ?? 'none';
    const ctxBefore = viz.cur ? `${viz.cur.kind}/${(viz.cur as any).phase ?? ''} carrier=${viz.ball.carrier} dead=${viz.ball.dead} flight=${viz.ball.inFlight} restart=${viz.pendingRestart?.kind ?? ''}` : 'none';
    viz.update(0.05); stats.simSecs += 0.05;
    if (viz.ball.carrier !== null && viz.ball.carrier !== lastCarrier) { stats.passes++; lastCarrier = viz.ball.carrier; }
    const bj = Math.hypot(viz.ball.pos.x - lastBall.x, viz.ball.pos.y - lastBall.y);
    if (bj > 3) { stats.ballJumps++; jumpsBy['ball:' + before] = (jumpsBy['ball:' + before] ?? 0) + 1; if (jumpsBy['ball:' + before] <= 3) console.log(`  ball jump ${bj.toFixed(1)}m during ${ctxBefore} -> ${viz.cur?.kind}/${(viz.cur as any)?.phase ?? ''} carrier=${viz.ball.carrier} dead=${viz.ball.dead}`); }
    if (bj < 0.05 && viz.ball.carrier === null) { still += 0.05; if (still > 8 && Math.abs(still - 8.05) < 0.03) { stats.stuck++; console.log(`  ! ball stuck 8s: ${ctxBefore}`); } } else still = 0;
    lastBall = { ...viz.ball.pos };
    for (const ag of viz.agents.values()) {
      const sp = Math.hypot(ag.vel.x, ag.vel.y); if (sp > stats.maxSpeed) stats.maxSpeed = sp;
      if (!Number.isFinite(ag.pos.x) || !Number.isFinite(ag.pos.y)) { stats.nan++; problems++; }
      if (ag.pos.x < -3 || ag.pos.x > L + 3 || ag.pos.y < -3 || ag.pos.y > W + 3) stats.offPitch++;
      const lp = lastPos.get(ag.id);
      if (lp && Math.hypot(ag.pos.x - lp.x, ag.pos.y - lp.y) > 3) { stats.playerJumps++; jumpsBy['player:' + before] = (jumpsBy['player:' + before] ?? 0) + 1; if (jumpsBy['player:' + before] <= 3 && before !== 'stoppage') console.log(`  player jump ${Math.hypot(ag.pos.x - lp.x, ag.pos.y - lp.y).toFixed(1)}m (${ag.role}) during ${ctxBefore} -> ${viz.cur?.kind}/${(viz.cur as any)?.phase ?? ''}`); }
      lastPos.set(ag.id, { x: ag.pos.x, y: ag.pos.y });
    }
    if (!Number.isFinite(viz.ball.pos.x) || !Number.isFinite(viz.ball.pos.y)) { stats.nan++; problems++; }
    if (viz.cur && viz.cur.kind === 'possession') { stats.crowdSamples++; let n = 0; for (const ag of viz.agents.values()) if (Math.hypot(ag.pos.x - viz.ball.pos.x, ag.pos.y - viz.ball.pos.y) < 4) n++; if (n >= 4) stats.crowded++; }
  };
  let guard = 0;
  while (!sim.finished && guard++ < 400) {
    let waited = 0;
    while (viz.busy() && waited < 150) { step(); waited += 0.05; }
    if (waited >= 150) { stats.longPlays++; problems++; console.log(`  ! play never finished: ${JSON.stringify(viz.cur)?.slice(0, 140)} queue=${viz.queue.length}`); viz.queue.length = 0; viz.cur = null; }
    const snap = sim.step();
    stats.minutes++;
    stats.goals += snap.events.filter((e) => e.type === 'goal' || e.type === 'pen_goal').length;
    viz.enqueueMinute(snap.events, snap.attacking, `${sim.minute}'`);
    const steps = viz.busy() ? 40 : 240;
    for (let k = 0; k < steps; k++) { step(); if (!viz.busy() && viz.queue.length === 0 && viz.cur === null) break; }
  }
  // drain
  let drain = 0; while (viz.busy() && drain++ < 3000) step();
  if (!sim.finished) { console.log('  ! match did not finish'); problems++; }
  const all = sim.events;
  stats.engineEvents += all.length; stats.committed += committed.length;
  const missing = all.filter((e) => !seen.has(e) && e.type !== 'kickoff');
  stats.uncommitted += missing.length;
  if (missing.length) console.log('  ! uncommitted:', missing.slice(0, 6).map((e) => `${e.minute}' ${e.type}`).join(', '));
  // order check: committed sequence should be non-decreasing in engine index, except VAR (var after goal)
  let idx = -1; for (const e of committed) { const j = all.indexOf(e); if (j < idx && e.type !== 'var') stats.outOfOrder++; idx = Math.max(idx, j); }
  console.log(`match ${i + 1}: ${h.short} ${sim.H.goals}-${sim.A.goals} ${a.short}${sim.shootoutIdx ? ' (pens)' : ''} · shown ${viz.score[0]}-${viz.score[1]} · events ${all.length}, committed ${committed.length}`);
  if (viz.score[0] !== sim.H.goals || viz.score[1] !== sim.A.goals) { console.log('  ! shown score differs'); problems++; }
}
console.log(stats, jumpsBy, 'problems:', problems);
process.exit(problems ? 1 : 0);
