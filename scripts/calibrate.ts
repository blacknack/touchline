import { buildWorld } from '../src/engine/world';
import { pickLineup, aiTactic, squadStrength } from '../src/engine/tactics';
import { MatchSim } from '../src/engine/match/engine';
import { Fixture } from '../src/engine/types';
import { RNG } from '../src/engine/rng';

const w = buildWorld(42, 0);
const clubs = Object.values(w.clubs);
const pl = clubs.filter((c) => c.leagueId === 'ENG1');
const rng = new RNG(7);
const N = Number(process.argv[2] ?? 600);
const agg = { goals: 0, hg: 0, ag: 0, shots: 0, onT: 0, corners: 0, fouls: 0, yel: 0, red: 0, pens: 0, penGoals: 0, off: 0, xg: 0, hw: 0, d: 0, aw: 0, inj: 0, subs: 0, bigCh: 0, saves: 0, motmSum: 0, ratings: [] as number[], poss: 0, ownG: 0, fk: 0 };
const dist: Record<string, number> = {};
const strength = new Map<number, number>();
for (const c of pl) strength.set(c.id, squadStrength(c, w.players));
console.log('PL strengths:', pl.map((c) => `${c.short}:${strength.get(c.id)!.toFixed(1)}`).join(' '));
let t0 = Date.now();
for (let i = 0; i < N; i++) {
  const h = rng.pick(pl); let a = rng.pick(pl); while (a.id === h.id) a = rng.pick(pl);
  const fx: Fixture = { id: i, compId: 'ENG1', stage: 0, stageName: 'R', homeId: h.id, awayId: a.id, day: 0, leg: 0, tieId: null, neutral: false, played: false, result: null, knockout: false };
  const sim = new MatchSim(w.players, h, a, fx, {
    seed: i * 7919 + 1, homeLineup: pickLineup(h, w.players, 'ENG1'), awayLineup: pickLineup(a, w.players, 'ENG1'),
    homeTactic: aiTactic(h, w.players, strength.get(h.id)! - strength.get(a.id)!, () => rng.next()), awayTactic: aiTactic(a, w.players, strength.get(a.id)! - strength.get(h.id)!, () => rng.next()),
    knockout: false, neutral: false, userSide: null,
  });
  const r = sim.runAll();
  agg.goals += r.hg + r.ag; agg.hg += r.hg; agg.ag += r.ag;
  agg.shots += r.stats.H.shots + r.stats.A.shots; agg.onT += r.stats.H.onTarget + r.stats.A.onTarget;
  agg.corners += r.stats.H.corners + r.stats.A.corners; agg.fouls += r.stats.H.fouls + r.stats.A.fouls;
  agg.yel += r.stats.H.yellows + r.stats.A.yellows; agg.red += r.stats.H.reds + r.stats.A.reds;
  agg.off += r.stats.H.offsides + r.stats.A.offsides; agg.xg += r.stats.H.xg + r.stats.A.xg; agg.bigCh += r.stats.H.bigChances + r.stats.A.bigChances;
  agg.saves += r.stats.H.saves + r.stats.A.saves;
  agg.pens += r.events.filter((e) => e.type === 'penalty_awarded').length; agg.penGoals += r.events.filter((e) => e.type === 'pen_goal').length;
  agg.inj += r.events.filter((e) => e.type === 'injury').length; agg.subs += r.events.filter((e) => e.type === 'sub').length;
  agg.fk += r.events.filter((e) => e.type === 'freekick').length;
  if (r.hg > r.ag) agg.hw++; else if (r.hg === r.ag) agg.d++; else agg.aw++;
  agg.poss += r.stats.H.possession;
  for (const v of Object.values(r.ratings)) agg.ratings.push(v);
  const k = `${r.hg}-${r.ag}`; dist[k] = (dist[k] ?? 0) + 1;
}
const ms = Date.now() - t0;
const per = (v: number) => (v / N).toFixed(2);
console.log(`\n${N} matches in ${ms}ms (${(ms / N).toFixed(1)} ms/match)`);
console.log(`goals/game ${per(agg.goals)} (home ${per(agg.hg)} away ${per(agg.ag)})  xG ${per(agg.xg)}`);
console.log(`shots ${per(agg.shots)} onTarget ${per(agg.onT)} bigChances ${per(agg.bigCh)} saves ${per(agg.saves)} corners ${per(agg.corners)} fouls ${per(agg.fouls)} offsides ${per(agg.off)} freekicks(att) ${per(agg.fk)}`);
console.log(`yellows ${per(agg.yel)} reds ${per(agg.red)} pens ${per(agg.pens)} penGoals ${per(agg.penGoals)} injuries ${per(agg.inj)} subs ${per(agg.subs)}`);
console.log(`H/D/A: ${(100 * agg.hw / N).toFixed(0)}% ${(100 * agg.d / N).toFixed(0)}% ${(100 * agg.aw / N).toFixed(0)}%  avg home possession ${per(agg.poss)}%`);
const rs = agg.ratings.sort((a, b) => a - b);
console.log(`ratings: mean ${(rs.reduce((s, v) => s + v, 0) / rs.length).toFixed(2)} p10 ${rs[Math.floor(rs.length * 0.1)]} p50 ${rs[Math.floor(rs.length * 0.5)]} p90 ${rs[Math.floor(rs.length * 0.9)]} max ${rs[rs.length - 1]}`);
console.log('score dist:', Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${(100 * v / N).toFixed(0)}%`).join(' '));

// strong vs weak sanity
const strong = pl.slice().sort((a, b) => strength.get(b.id)! - strength.get(a.id)!);
const top = strong[0], bottom = strong[strong.length - 1];
let tw = 0, td = 0, tl = 0;
for (let i = 0; i < 200; i++) {
  const fx: Fixture = { id: 9000 + i, compId: 'ENG1', stage: 0, stageName: 'R', homeId: top.id, awayId: bottom.id, day: 0, leg: 0, tieId: null, neutral: false, played: false, result: null, knockout: false };
  const home = i % 2 === 0;
  const h = home ? top : bottom, a = home ? bottom : top;
  const sim = new MatchSim(w.players, h, a, { ...fx, homeId: h.id, awayId: a.id }, { seed: 555 + i, homeLineup: pickLineup(h, w.players, 'ENG1'), awayLineup: pickLineup(a, w.players, 'ENG1'), homeTactic: aiTactic(h, w.players, strength.get(h.id)! - strength.get(a.id)!, () => rng.next()), awayTactic: aiTactic(a, w.players, strength.get(a.id)! - strength.get(h.id)!, () => rng.next()), knockout: false, neutral: false, userSide: null });
  const r = sim.runAll();
  const topGoals = home ? r.hg : r.ag, botGoals = home ? r.ag : r.hg;
  if (topGoals > botGoals) tw++; else if (topGoals === botGoals) td++; else tl++;
}
console.log(`${top.name} (${strength.get(top.id)!.toFixed(1)}) vs ${bottom.name} (${strength.get(bottom.id)!.toFixed(1)}): W ${tw} D ${td} L ${tl} of 200`);
