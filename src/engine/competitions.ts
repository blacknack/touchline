import { Club, Competition, CupStage, Fixture, GameState, Standing } from './types';
import { RNG, hashString } from './rng';
import { SeasonCalendar, leagueWeekendSlots } from './calendar';
import { dayOfWeek } from './attributes';
import { swissTemplate } from './swiss';

// ─────────────────────────── helpers ───────────────────────────
export const emptyStanding = (clubId: number): Standing => ({ clubId, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [], deduction: 0 });

export function sortStandings(rows: Standing[], clubs: Record<number, Club>): Standing[] {
  return rows.slice().sort((a, b) => (b.pts - b.deduction) - (a.pts - a.deduction) || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || clubs[a.clubId].name.localeCompare(clubs[b.clubId].name));
}

export function newFixture(state: GameState, partial: Omit<Fixture, 'id' | 'played' | 'result'>): Fixture {
  const f: Fixture = { id: state.nextId.fixture++, played: false, result: null, ...partial };
  state.fixtures[f.id] = f;
  state.competitions[f.compId].seasonFixtures.push(f.id);
  return f;
}

/** Days on which a club already has a fixture (unplayed or played) */
export function clubDays(state: GameState, clubId: number): Set<number> {
  const s = new Set<number>();
  for (const f of Object.values(state.fixtures)) if (f.homeId === clubId || f.awayId === clubId) s.add(f.day);
  return s;
}
function clubBusyIndex(state: GameState): Map<number, Set<number>> {
  const m = new Map<number, Set<number>>();
  for (const f of Object.values(state.fixtures)) {
    if (!m.has(f.homeId)) m.set(f.homeId, new Set()); if (!m.has(f.awayId)) m.set(f.awayId, new Set());
    m.get(f.homeId)!.add(f.day); m.get(f.awayId)!.add(f.day);
  }
  return m;
}
const nearBusy = (days: Set<number> | undefined, d: number, gap: number) => { if (!days) return false; for (let x = d - gap; x <= d + gap; x++) if (days.has(x)) return true; return false; };

/** Move league fixtures that clash with `day` for either club to the next free midweek. */
export function resolveClashes(state: GameState, cal: SeasonCalendar, clubIds: number[], day: number) {
  const idx = clubBusyIndex(state);
  for (const f of Object.values(state.fixtures)) {
    if (f.played) continue;
    const comp = state.competitions[f.compId];
    if (comp.type !== 'league') continue;
    if (Math.abs(f.day - day) > 1) continue;
    if (!clubIds.includes(f.homeId) && !clubIds.includes(f.awayId)) continue;
    // postpone
    const hd = idx.get(f.homeId), ad = idx.get(f.awayId);
    hd?.delete(f.day); ad?.delete(f.day);
    let d = day + 3;
    const nation = comp.nation ?? 'ENG';
    const wb = cal.winterBreak[nation];
    for (let tries = 0; tries < 400; tries++, d++) {
      const dow = dayOfWeek(d);
      if (dow !== 2 && dow !== 3 && dow !== 4) continue;
      if (cal.busyDays.has(d)) continue;
      if (wb && d >= wb[0] && d <= wb[1]) continue;
      if (d > cal.leagueEnd[f.compId] + 10) break;
      if (nearBusy(hd, d, 2) || nearBusy(ad, d, 2)) continue;
      break;
    }
    f.day = d;
    hd?.add(d); ad?.add(d);
  }
}

// ─────────────────────────── leagues ───────────────────────────
export function roundRobin(ids: number[], rng: RNG): [number, number][][] {
  const teams = rng.shuffle(ids);
  const n = teams.length;
  const rounds: [number, number][][] = [];
  const arr = teams.slice();
  for (let r = 0; r < n - 1; r++) {
    const round: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (r % 2 === 0) round.push([a, b]); else round.push([b, a]);
    }
    rounds.push(round);
    arr.splice(1, 0, arr.pop()!);
  }
  const first = rng.shuffle(rounds);
  const second = first.map((rd) => rd.map(([h, a]) => [a, h] as [number, number]));
  return [...first, ...rng.shuffle(second)];
}

export function createLeague(state: GameState, cal: SeasonCalendar, id: string, name: string, short: string, nation: string, teamIds: number[], rng: RNG, prize: number, color: string, reputation: number): Competition {
  const comp: Competition = {
    id, name, short, type: 'league', nation, level: 1, teams: teamIds.slice(), standings: teamIds.map(emptyStanding), rounds: (teamIds.length - 1) * 2,
    relegation: 3, finished: false, seasonFixtures: [], prizeMoney: prize, reputation, color, winnerId: null, runnerUpId: null,
  };
  state.competitions[id] = comp;
  const rounds = roundRobin(teamIds, rng);
  const weekends = leagueWeekendSlots(cal, id, nation);
  const midweeks = cal.leagueMidweeks[id] ?? [];
  let slots = weekends.slice();
  if (slots.length < rounds.length) {
    const need = rounds.length - slots.length;
    slots = [...slots, ...midweeks.slice(0, need)].sort((a, b) => a - b);
  }
  // still short? add extra Tuesdays after the nominal end
  let extra = cal.leagueEnd[id] + 3;
  while (slots.length < rounds.length) { slots.push(extra); extra += 4; }
  rounds.forEach((rd, i) => {
    const day = slots[i];
    for (const [h, a] of rd) newFixture(state, { compId: id, stage: i, stageName: `Matchday ${i + 1}`, homeId: h, awayId: a, day, leg: 0, tieId: null, neutral: false, knockout: false });
  });
  return comp;
}

export function applyLeagueResult(comp: Competition, f: Fixture) {
  if (!comp.standings || !f.result) return;
  const r = f.result;
  const h = comp.standings.find((s) => s.clubId === f.homeId)!;
  const a = comp.standings.find((s) => s.clubId === f.awayId)!;
  h.p++; a.p++; h.gf += r.hg; h.ga += r.ag; a.gf += r.ag; a.ga += r.hg;
  if (r.hg > r.ag) { h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L'); }
  else if (r.hg < r.ag) { a.w++; h.l++; a.pts += 3; a.form.push('W'); h.form.push('L'); }
  else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D'); }
  if (h.form.length > 6) h.form.shift(); if (a.form.length > 6) a.form.shift();
}

// ─────────────────────────── cups ───────────────────────────
export interface CupStageDef { name: string; twoLegged: boolean; neutral: boolean; extraTime: boolean; lowerHosts?: boolean; }

export function createCup(state: GameState, id: string, name: string, short: string, nation: string | null, type: 'cup' | 'supercup' | 'euro', stageDefs: CupStageDef[], days: number[], days2: (number | null)[], entrants: number[][], prize: number, color: string, reputation: number, teams: number[]): Competition {
  const stages: CupStage[] = stageDefs.map((s, i) => ({ name: s.name, twoLegged: s.twoLegged, neutral: s.neutral, entrants: entrants[i] ?? [], extraTime: s.extraTime, replays: false, day: days[i], day2: days2[i] ?? undefined, drawn: false, fixtureIds: [] }));
  const comp: Competition = { id, name, short, type, nation, level: 1, teams, stages, currentStage: 0, finished: false, seasonFixtures: [], prizeMoney: prize, reputation, color, winnerId: null, runnerUpId: null };
  comp.lowerHosts = stageDefs.map((s) => !!s.lowerHosts);
  state.competitions[id] = comp;
  return comp;
}

/** Winners of a completed stage (both legs / single) in fixture order */
export function stageWinners(state: GameState, comp: Competition, stageIdx: number): number[] {
  const st = comp.stages![stageIdx];
  const winners: number[] = [];
  const seenTie = new Set<number>();
  for (const fid of st.fixtureIds) {
    const f = state.fixtures[fid];
    if (!f.played || !f.result) continue;
    if (f.tieId !== null) {
      if (seenTie.has(f.tieId)) continue;
      if (f.leg === 1) continue; // wait for leg 2
      seenTie.add(f.tieId);
      winners.push(f.result.winnerId!);
    } else winners.push(f.result.winnerId!);
  }
  return winners;
}

export function stageComplete(state: GameState, comp: Competition, stageIdx: number): boolean {
  const st = comp.stages![stageIdx];
  if (!st.drawn) return false;
  return st.fixtureIds.every((fid) => state.fixtures[fid].played);
}

/** Draw a cup stage: entrants = previous winners + stage entrants. Creates fixtures. */
export function drawCupStage(state: GameState, cal: SeasonCalendar, comp: Competition, stageIdx: number, rng: RNG, seededPairs?: [number, number][]) {
  const st = comp.stages![stageIdx];
  if (st.drawn) return;
  const prev = stageIdx > 0 ? stageWinners(state, comp, stageIdx - 1) : [];
  let pool = [...prev, ...(st.entrants ?? [])];
  pool = pool.filter((id, i) => pool.indexOf(id) === i);
  if (pool.length % 2 === 1) {
    // a bye for the highest-reputation entrant... simplest: give bye to a random lower-rep entrant by dropping to next stage
    pool = pool.slice();
    const bye = pool.slice().sort((a, b) => state.clubs[b].reputation - state.clubs[a].reputation)[0];
    pool = pool.filter((x) => x !== bye);
    st.byes = [bye];
  }
  const lowerHosts = comp.lowerHosts?.[stageIdx] ?? false;
  const pairs: [number, number][] = seededPairs ?? [];
  if (!seededPairs) {
    const shuffled = rng.shuffle(pool);
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      let h = shuffled[i], a = shuffled[i + 1];
      if (lowerHosts && state.clubs[h].tier < state.clubs[a].tier) [h, a] = [a, h];
      pairs.push([h, a]);
    }
  }
  st.drawn = true;
  let tieSeq = 1;
  for (const [h, a] of pairs) {
    if (st.twoLegged && st.day2) {
      const tieId = hashString(`${comp.id}-${stageIdx}-${tieSeq++}`);
      const f1 = newFixture(state, { compId: comp.id, stage: stageIdx, stageName: `${st.name} 1st leg`, homeId: h, awayId: a, day: st.day, leg: 1, tieId, neutral: false, knockout: false });
      const f2 = newFixture(state, { compId: comp.id, stage: stageIdx, stageName: `${st.name} 2nd leg`, homeId: a, awayId: h, day: st.day2, leg: 2, tieId, neutral: false, knockout: true, aggregateOf: f1.id });
      st.fixtureIds.push(f1.id, f2.id);
      resolveClashes(state, cal, [h, a], st.day); resolveClashes(state, cal, [h, a], st.day2);
    } else {
      const f = newFixture(state, { compId: comp.id, stage: stageIdx, stageName: st.name, homeId: h, awayId: a, day: st.day, leg: 0, tieId: null, neutral: st.neutral, knockout: true });
      st.fixtureIds.push(f.id);
      resolveClashes(state, cal, [h, a], st.day);
    }
  }
  comp.currentStage = stageIdx;
}

/** Called after a cup fixture is played; advances stages, finishes competition. Returns true if the comp finished now. */
export function advanceCup(state: GameState, cal: SeasonCalendar, comp: Competition, rng: RNG): boolean {
  const idx = comp.currentStage ?? 0;
  if (!stageComplete(state, comp, idx)) return false;
  const winners = stageWinners(state, comp, idx);
  const byes: number[] = comp.stages![idx].byes ?? [];
  if (idx === comp.stages!.length - 1) {
    comp.finished = true;
    comp.winnerId = winners[0] ?? null;
    const finalF = state.fixtures[comp.stages![idx].fixtureIds[0]];
    if (finalF) comp.runnerUpId = finalF.result?.winnerId === finalF.homeId ? finalF.awayId : finalF.homeId;
    return true;
  }
  // next stage
  const next = comp.stages![idx + 1];
  if (byes.length) next.entrants = [...(next.entrants ?? []), ...byes];
  if (comp.type === 'euro') return false; // euro knockouts handled by advanceEuro
  drawCupStage(state, cal, comp, idx + 1, rng);
  return false;
}

// ─────────────────────────── European league phase ───────────────────────────
export function createEuroLeaguePhase(state: GameState, cal: SeasonCalendar, id: string, name: string, short: string, teams: number[], pots: Record<number, number>, mdDays: number[], koDays: { po: [number, number]; r16: [number, number]; qf: [number, number]; sf: [number, number]; final: number }, rng: RNG, prize: number, color: string, reputation: number, nPots: number, potSize: number, perPot: number) {
  const stageDefs: CupStageDef[] = [
    { name: 'Knockout play-off', twoLegged: true, neutral: false, extraTime: true },
    { name: 'Round of 16', twoLegged: true, neutral: false, extraTime: true },
    { name: 'Quarter-final', twoLegged: true, neutral: false, extraTime: true },
    { name: 'Semi-final', twoLegged: true, neutral: false, extraTime: true },
    { name: 'Final', twoLegged: false, neutral: true, extraTime: true },
  ];
  const comp = createCup(state, id, name, short, null, 'euro', stageDefs, [koDays.po[0], koDays.r16[0], koDays.qf[0], koDays.sf[0], koDays.final], [koDays.po[1], koDays.r16[1], koDays.qf[1], koDays.sf[1], null], [[], [], [], [], []], prize, color, reputation, teams);
  comp.standings = teams.map(emptyStanding);
  comp.pots = pots;
  comp.rounds = mdDays.length;
  comp.bracket = {};
  // assign teams to template slots within pots
  const tpl = swissTemplate(nPots, potSize, perPot);
  const byPot: Record<number, number[]> = {};
  for (const t of teams) { const p = pots[t] ?? nPots; (byPot[p] ??= []).push(t); }
  // fill/trim pots to size
  const slotTeam: number[] = [];
  let bestAssign: number[] | null = null, bestClash = 1e9;
  for (let attempt = 0; attempt < 60; attempt++) {
    const assign: number[] = [];
    for (let p = 1; p <= nPots; p++) {
      const list = rng.shuffle(byPot[p] ?? []);
      for (let k = 0; k < potSize; k++) assign.push(list[k]);
    }
    // count same-nation clashes
    let clash = 0;
    for (const g of tpl.games) { const a = assign[g.home], b = assign[g.away]; if (a === undefined || b === undefined) { clash += 100; continue; } if (state.clubs[a].nation === state.clubs[b].nation) clash++; }
    if (clash < bestClash) { bestClash = clash; bestAssign = assign; }
    if (clash === 0) break;
  }
  slotTeam.push(...(bestAssign ?? []));
  for (const g of tpl.games) {
    const h = slotTeam[g.home], a = slotTeam[g.away];
    if (h === undefined || a === undefined) continue;
    const day = mdDays[g.md];
    // split Tue/Wed for UCL (Wed given; some on Tue)
    const d = id === 'UCL' && rng.chance(0.5) ? day - 1 : day;
    newFixture(state, { compId: id, stage: g.md, stageName: `Matchday ${g.md + 1}`, homeId: h, awayId: a, day: d, leg: 0, tieId: null, neutral: false, knockout: false });
  }
  return comp;
}

export function leaguePhaseComplete(state: GameState, comp: Competition): boolean {
  return comp.seasonFixtures.every((fid) => { const f = state.fixtures[fid]; return f.stage >= 100 || f.played; });
}

/** After the league phase: set up play-off ties and bracket */
export function drawEuroKnockoutPlayoff(state: GameState, cal: SeasonCalendar, comp: Competition, rng: RNG) {
  const order = sortStandings(comp.standings!, state.clubs).map((s) => s.clubId);
  const top8 = order.slice(0, 8);
  const po = order.slice(8, 24);
  // pairs: (15/16 v 17/18), (13/14 v 19/20), (11/12 v 21/22), (9/10 v 23/24) — index within 'po' list (0=9th)
  const groups: [number[], number[]][] = [[[6, 7], [8, 9]], [[4, 5], [10, 11]], [[2, 3], [12, 13]], [[0, 1], [14, 15]]];
  const pairs: [number, number][] = [];
  const bracketR16: number[][] = [];
  for (const [seedIdx, unseedIdx] of groups) {
    const seeds = seedIdx.map((i) => po[i]).filter(Boolean);
    const unseeds = rng.shuffle(unseedIdx.map((i) => po[i]).filter(Boolean));
    for (let k = 0; k < seeds.length; k++) {
      const seeded = seeds[k], uns = unseeds[k];
      if (!seeded || !uns) continue;
      pairs.push([uns, seeded]); // unseeded hosts first leg
      bracketR16.push([seeded, uns]);
    }
  }
  comp.bracket = comp.bracket ?? {};
  comp.bracket.top8 = top8;
  comp.bracket.poPairs = pairs.flat();
  drawCupStage(state, cal, comp, 0, rng, pairs);
}

export function advanceEuro(state: GameState, cal: SeasonCalendar, comp: Competition, rng: RNG): boolean {
  const idx = comp.currentStage ?? 0;
  if (!comp.stages![idx].drawn || !stageComplete(state, comp, idx)) return false;
  const winners = stageWinners(state, comp, idx);
  if (idx === comp.stages!.length - 1) {
    comp.finished = true; comp.winnerId = winners[0] ?? null;
    const finalF = state.fixtures[comp.stages![idx].fixtureIds[0]];
    if (finalF) comp.runnerUpId = finalF.result?.winnerId === finalF.homeId ? finalF.awayId : finalF.homeId;
    return true;
  }
  let pairs: [number, number][] = [];
  if (idx === 0) {
    // R16: top8 seeds vs PO winners. Bracket: seeds (1,2) meet winners of ties from group 15/16-17/18 etc.
    const top8 = comp.bracket!.top8;
    const poPairs = comp.bracket!.poPairs; // [uns, seeded] flat, in group order (4 groups × 2 ties)
    // winners are in fixture order = pairs order
    const groupWinners: number[][] = [[], [], [], []];
    for (let i = 0; i < winners.length; i++) groupWinners[Math.floor(i / 2)].push(winners[i]);
    // group 0 (15/16 v 17/18) plays seeds 1,2; group1 -> seeds 3,4; group2 -> 5,6; group3 -> 7,8
    const r16: [number, number][] = [];
    for (let g = 0; g < 4; g++) {
      const seeds = [top8[g * 2], top8[g * 2 + 1]].filter(Boolean);
      const ws = rng.shuffle(groupWinners[g]);
      for (let k = 0; k < seeds.length; k++) if (ws[k] !== undefined) r16.push([ws[k], seeds[k]]); // seed plays 2nd leg at home
    }
    void poPairs;
    // bracket order for later rounds: r16 index i pairs with i^1 in QF, etc.
    pairs = r16;
  } else {
    // subsequent rounds: winners in order, pair consecutive (fixed bracket)
    for (let i = 0; i + 1 < winners.length; i += 2) {
      const a = winners[i], b = winners[i + 1];
      pairs.push(rng.chance(0.5) ? [a, b] : [b, a]);
    }
  }
  drawCupStage(state, cal, comp, idx + 1, rng, pairs);
  return false;
}

// ─────────────────────────── qualification helpers ───────────────────────────
export function leagueOrder(comp: Competition, clubs: Record<number, Club>): number[] {
  return sortStandings(comp.standings ?? [], clubs).map((s) => s.clubId);
}
