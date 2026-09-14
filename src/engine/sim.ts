import { Club, Fixture, GameState, MatchResult, Player, SeasonStats, emptyStats, Lineup, Tactic } from './types';
import { RNG, hashString, clamp } from './rng';
import { MatchSim, MatchOptions } from './match/engine';
import { pickLineup, repairLineup, aiTactic, squadStrength, isAvailable } from './tactics';
import { applyLeagueResult, advanceCup, advanceEuro, leaguePhaseComplete, drawEuroKnockoutPlayoff, leagueOrder } from './competitions';
import { calendarFor, addNews, startSeason, endSeason, expectationRank } from './season';
import { formatDay, seasonLabel, calcValue, ageOn } from './attributes';
import { weeklyTransfers, processOffersAI, expireOffers } from './transfers';
import { weeklyFinance, matchdayIncome, prizeMoneyEndOfSeason } from './finance';
import { monthlyDevelopment, endOfSeasonDevelopment, youthIntake, retirements, contractExpiry } from './development';

export const strengthCache = new Map<string, number>();
export function clubStrength(state: GameState, club: Club): number {
  const key = `${club.id}:${state.day}`;
  if (strengthCache.has(key)) return strengthCache.get(key)!;
  const s = squadStrength(club, state.players);
  strengthCache.set(key, s);
  if (strengthCache.size > 5000) strengthCache.clear();
  return s;
}

function matchImportance(state: GameState, f: Fixture): number {
  const comp = state.competitions[f.compId];
  if (comp.type === 'euro') return f.stage >= 100 || (comp.stages && comp.currentStage !== undefined && f.knockout) ? 1.3 : 1.1;
  if (comp.type === 'supercup') return 1.0;
  if (comp.type === 'cup') return f.stageName.includes('Final') ? 1.3 : 0.9;
  return 1;
}

export function buildMatchOptions(state: GameState, f: Fixture, userSide: 'H' | 'A' | null, userLineup?: Lineup, userTactic?: Tactic): MatchOptions {
  const home = state.clubs[f.homeId], away = state.clubs[f.awayId];
  const sh = clubStrength(state, home), sa = clubStrength(state, away);
  const rng = new RNG(hashString(`${state.seed}-${f.id}-tac`));
  const homeLineup = userSide === 'H' && userLineup ? userLineup : pickLineup(home, state.players, f.compId, { rotate: rotationFor(state, home, f) });
  const awayLineup = userSide === 'A' && userLineup ? userLineup : pickLineup(away, state.players, f.compId, { rotate: rotationFor(state, away, f) });
  const homeTactic = userSide === 'H' && userTactic ? userTactic : aiTactic(home, state.players, sh - sa, () => rng.next());
  const awayTactic = userSide === 'A' && userTactic ? userTactic : aiTactic(away, state.players, sa - sh, () => rng.next());
  let aggregate: [number, number] | undefined;
  if (f.leg === 2 && f.aggregateOf !== undefined) {
    const first = state.fixtures[f.aggregateOf];
    if (first?.result) aggregate = [first.result.ag, first.result.hg]; // first leg: home of this = away of first
  }
  return { seed: hashString(`${state.seed}-${f.id}`), homeLineup, awayLineup, homeTactic, awayTactic, knockout: f.knockout, neutral: f.neutral, userSide, aggregate, importance: matchImportance(state, f) };
}

/** How much an AI club rotates: more in minor cups / when squad is deep */
function rotationFor(state: GameState, club: Club, f: Fixture): number {
  const comp = state.competitions[f.compId];
  if (comp.type === 'cup' && !f.stageName.includes('Final') && !f.stageName.includes('Semi')) return 0.6;
  if (comp.type === 'euro' && f.stage < 100 && club.reputation > 85) return 0.2;
  return 0.12;
}

export function simulateAIFixture(state: GameState, f: Fixture): MatchResult {
  const home = state.clubs[f.homeId], away = state.clubs[f.awayId];
  const opts = buildMatchOptions(state, f, null);
  const sim = new MatchSim(state.players, home, away, f, opts);
  const r = sim.runAll();
  applyResult(state, f, r);
  return r;
}

// ───────────────────────── result application ─────────────────────────
function statsFor(p: Player, compId: string): SeasonStats { return (p.stats[compId] ??= emptyStats()); }

function injuryFromEvent(rng: RNG): { type: string; days: number } {
  const r = rng.next();
  if (r < 0.40) return { type: rng.pick(['knock', 'bruised ankle', 'dead leg', 'tight calf']), days: rng.int(3, 8) };
  if (r < 0.75) return { type: rng.pick(['hamstring strain', 'groin strain', 'ankle sprain', 'thigh strain']), days: rng.int(9, 21) };
  if (r < 0.92) return { type: rng.pick(['torn hamstring', 'knee ligament sprain', 'broken toe', 'calf tear']), days: rng.int(22, 55) };
  if (r < 0.99) return { type: rng.pick(['fractured metatarsal', 'MCL injury', 'shoulder dislocation', 'ankle ligament damage']), days: rng.int(60, 150) };
  return { type: rng.pick(['ACL rupture', 'Achilles tendon rupture', 'broken leg']), days: rng.int(180, 290) };
}

const KEY_EVENTS = new Set(['goal', 'pen_goal', 'pen_miss', 'pen_saved', 'own_goal', 'yellow', 'second_yellow', 'red', 'injury', 'sub', 'penalty_awarded', 'var_overturn', 'shootout_goal', 'shootout_miss', 'et_start', 'halftime', 'fulltime']);

export function applyResult(state: GameState, f: Fixture, r: MatchResult) {
  f.played = true; f.result = r;
  const comp = state.competitions[f.compId];
  const rng = new RNG(hashString(`${state.seed}-${f.id}-post`));
  const home = state.clubs[f.homeId], away = state.clubs[f.awayId];
  const isUserMatch = home.id === state.manager.clubId || away.id === state.manager.clubId;
  const fullEvents = r.events;
  if (!isUserMatch) r.events = fullEvents.filter((e) => KEY_EVENTS.has(e.type));
  const sides: ['H' | 'A', Club, number, number][] = [['H', home, r.hg, r.ag], ['A', away, r.ag, r.hg]];
  for (const [side, club, gf, ga] of sides) {
    const lineup = r.lineups[side];
    const played = Object.keys(r.minutes).map(Number).filter((id) => club.players.includes(id) && r.minutes[id] > 0);
    for (const id of played) {
      const p = state.players[id]; if (!p) continue;
      const mins = r.minutes[id];
      for (const key of [f.compId, 'ALL']) {
        const s = statsFor(p, key);
        s.apps++; if (lineup.includes(id)) s.starts++; s.minutes += mins;
        s.ratingSum += r.ratings[id] ?? 6;
        if (ga === 0 && mins >= 60 && (p.pos === 'GK' || p.pos === 'CB' || p.pos === 'LB' || p.pos === 'RB')) s.cleanSheets++;
        if (p.pos === 'GK') { s.conceded += ga; s.saves += r.stats[side === 'H' ? 'A' : 'H'].onTarget - ga; }
        if (r.motm === id) s.motm++;
      }
      p.form.push(r.ratings[id] ?? 6); if (p.form.length > 5) p.form.shift();
      p.condition = clamp(Math.round(p.condition - mins * 0.42 - (r.et ? 8 : 0)), 15, 100);
      p.sharpness = clamp(p.sharpness + (mins >= 60 ? 8 : 4), 0, 100);
      // morale from result
      const won = gf > ga, drew = gf === ga;
      p.morale = clamp(p.morale + (won ? 5 : drew ? 1 : -4) + ((r.ratings[id] ?? 6) - 6.6) * 2, 5, 100);
    }
    // non-playing squad members: morale drift for not playing
    for (const id of club.players) {
      const p = state.players[id]; if (!p || played.includes(id)) continue;
      if (!p.injury && p.ovr >= 70 && rng.chance(0.35)) p.morale = clamp(p.morale - 1, 5, 100);
    }
    // events: goals, assists, cards, injuries
    for (const ev of fullEvents) {
      if (ev.side !== side || ev.playerId === undefined) continue;
      const p = state.players[ev.playerId]; if (!p || !club.players.includes(p.id)) continue;
      const bump = (fn: (s: SeasonStats) => void) => { fn(statsFor(p, f.compId)); fn(statsFor(p, 'ALL')); };
      switch (ev.type) {
        case 'goal': bump((s) => s.goals++); if (ev.secondaryId !== undefined && state.players[ev.secondaryId]) { const a = state.players[ev.secondaryId]; statsFor(a, f.compId).assists++; statsFor(a, 'ALL').assists++; } break;
        case 'pen_goal': bump((s) => { s.goals++; s.pensScored++; }); break;
        case 'pen_miss': case 'pen_saved': bump((s) => s.pensMissed++); break;
        case 'yellow': bump((s) => s.yellows++); p.yellowsInComp[f.compId] = (p.yellowsInComp[f.compId] ?? 0) + 1; {
          const n = p.yellowsInComp[f.compId];
          const threshold = comp.type === 'league' ? 5 : 3;
          if (n % threshold === 0) { p.suspension[f.compId] = (p.suspension[f.compId] ?? 0) + 1; if (isUserMatch && club.id === state.manager.clubId) addNews(state, { category: 'match', title: `${p.name} suspended`, body: `${p.name} will miss the next ${comp.name} match after collecting ${n} yellow cards.`, playerId: p.id, clubId: club.id }); }
        } break;
        case 'second_yellow': bump((s) => { s.yellows++; s.reds++; }); p.suspension[f.compId] = (p.suspension[f.compId] ?? 0) + 1; break;
        case 'red': bump((s) => s.reds++); p.suspension[f.compId] = (p.suspension[f.compId] ?? 0) + (rng.chance(0.3) ? 3 : rng.chance(0.5) ? 2 : 1); break;
        case 'injury': {
          const inj = injuryFromEvent(rng);
          p.injury = { type: inj.type, daysLeft: inj.days, totalDays: inj.days };
          p.condition = clamp(p.condition - 10, 10, 100);
          if (club.id === state.manager.clubId) addNews(state, { category: 'injury', title: `${p.name} injured`, body: `${p.name} picked up a ${inj.type} against ${club.id === home.id ? away.name : home.name} and is expected to be out for around ${inj.days >= 14 ? `${Math.round(inj.days / 7)} weeks` : `${inj.days} days`}.`, playerId: p.id, clubId: club.id, important: inj.days > 21 });
        } break;
      }
    }
    // suspensions tick for players who sat out this comp
    for (const id of club.players) {
      const p = state.players[id]; if (!p) continue;
      if ((p.suspension[f.compId] ?? 0) > 0 && !played.includes(id)) p.suspension[f.compId]--;
    }
    // fan happiness / board
    const diff = gf - ga;
    club.fanHappiness = clamp(club.fanHappiness + (diff > 0 ? 2 : diff < 0 ? -2 : 0) + (diff >= 3 ? 1 : 0), 0, 100);
  }
  // standings
  if (comp.type === 'league') applyLeagueResult(comp, f);
  if (comp.type === 'euro' && f.stage < 100 && !f.knockout && comp.standings && f.stage < (comp.rounds ?? 8)) applyLeagueResult(comp, f);
  // finance
  matchdayIncome(state, f, r);
  // news for user match
  if (isUserMatch) {
    const mine = home.id === state.manager.clubId ? home : away;
    const opp = mine.id === home.id ? away : home;
    const gf = mine.id === home.id ? r.hg : r.ag, ga = mine.id === home.id ? r.ag : r.hg;
    const outcome = gf > ga ? 'beat' : gf < ga ? 'lost to' : 'drew with';
    const scorers = (mine.id === home.id ? r.scorers.H : r.scorers.A).map((s) => `${state.players[s.playerId]?.name.split(' ').pop()} ${Math.floor(s.minute)}'`).join(', ');
    addNews(state, { category: 'match', title: `${mine.short} ${gf}-${ga} ${opp.short}${r.pens ? ` (${r.pens[0]}-${r.pens[1]} pens)` : r.et ? ' (aet)' : ''}`, body: `${mine.name} ${outcome} ${opp.name} in the ${comp.name}${f.stageName ? ` (${f.stageName})` : ''}.${scorers ? ` Scorers: ${scorers}.` : ''} Man of the match: ${state.players[r.motm]?.name ?? '-'}.`, fixtureId: f.id, clubId: mine.id });
  }
  state.stats.matchesPlayed++;
}

/** Called after fixtures on a day: cups/euro advancement, knockouts, finishing comps */
export function postFixtureAdvance(state: GameState) {
  const cal = calendarFor(state);
  const rng = new RNG(hashString(`${state.seed}-adv-${state.day}`));
  for (const comp of Object.values(state.competitions)) {
    if (comp.finished) continue;
    if (comp.type === 'cup' || comp.type === 'supercup') {
      const before = comp.currentStage;
      const done = advanceCup(state, cal, comp, rng);
      if (done) announceWinner(state, comp);
      else if (comp.currentStage !== before) announceDraw(state, comp);
    } else if (comp.type === 'euro') {
      const st = comp.stages![0];
      if (!st.drawn) {
        if (leaguePhaseComplete(state, comp)) { drawEuroKnockoutPlayoff(state, cal, comp, rng); announceDraw(state, comp); }
      } else {
        const before = comp.currentStage;
        const done = advanceEuro(state, cal, comp, rng);
        if (done) announceWinner(state, comp);
        else if (comp.currentStage !== before) announceDraw(state, comp);
      }
    } else if (comp.type === 'league') {
      if (comp.seasonFixtures.every((id) => state.fixtures[id].played) && !comp.finished) {
        comp.finished = true;
        const order = leagueOrder(comp, state.clubs);
        comp.winnerId = order[0]; comp.runnerUpId = order[1];
        announceWinner(state, comp);
      }
    }
  }
}

function announceWinner(state: GameState, comp: { id: string; name: string; winnerId?: number | null; runnerUpId?: number | null }) {
  if (!comp.winnerId) return;
  const w = state.clubs[comp.winnerId];
  const mine = comp.winnerId === state.manager.clubId;
  addNews(state, { category: 'competition', title: `${w.name} win the ${comp.name}`, body: mine ? `Congratulations! ${w.name} are ${comp.name} champions ${seasonLabel(state.seasonYear)}.` : `${w.name} have won the ${comp.name}${comp.runnerUpId ? `, beating ${state.clubs[comp.runnerUpId].name} to the title` : ''}.`, clubId: w.id, important: mine });
}
function announceDraw(state: GameState, comp: { id: string; name: string; stages?: { name: string; fixtureIds: number[] }[]; currentStage?: number }) {
  const st = comp.stages?.[comp.currentStage ?? 0]; if (!st) return;
  const mineFx = st.fixtureIds.map((id) => state.fixtures[id]).find((f) => f.homeId === state.manager.clubId || f.awayId === state.manager.clubId);
  if (!mineFx) return;
  const opp = mineFx.homeId === state.manager.clubId ? state.clubs[mineFx.awayId] : state.clubs[mineFx.homeId];
  addNews(state, { category: 'competition', title: `${comp.name} draw: ${st.name}`, body: `${state.clubs[state.manager.clubId].name} will face ${opp.name} ${mineFx.homeId === state.manager.clubId ? 'at home' : 'away'} in the ${st.name} on ${formatDay(mineFx.day, { weekday: true })}.`, fixtureId: mineFx.id, important: true });
}

// ───────────────────────── daily loop ─────────────────────────
export function fixturesOn(state: GameState, day: number): Fixture[] {
  return Object.values(state.fixtures).filter((f) => f.day === day && !f.played);
}
export function userFixtureOn(state: GameState, day: number): Fixture | undefined {
  if (state.manager.unemployed) return undefined;
  return fixturesOn(state, day).find((f) => f.homeId === state.manager.clubId || f.awayId === state.manager.clubId);
}
export function nextUserFixture(state: GameState): Fixture | undefined {
  const mine = Object.values(state.fixtures).filter((f) => !f.played && (f.homeId === state.manager.clubId || f.awayId === state.manager.clubId)).sort((a, b) => a.day - b.day);
  return mine[0];
}

export type StopReason = 'match' | 'inbox' | 'season' | 'sacked' | 'offer' | null;

/**
 * Advance one day. If the user has a fixture today it returns 'match' BEFORE simulating it (state.pendingUserFixture set).
 * Otherwise simulates the day's fixtures and runs daily processing.
 */
export function advanceDay(state: GameState): StopReason {
  const cal = calendarFor(state);
  // user fixture today?
  const uf = userFixtureOn(state, state.day);
  if (uf && state.pendingUserFixture !== uf.id) {
    // simulate other fixtures earlier in the day? Play them after the user match for simultaneity.
    state.pendingUserFixture = uf.id;
    // repair lineup ahead of match
    const club = state.clubs[state.manager.clubId];
    club.lineup = repairLineup(club, state.players, uf.compId);
    return 'match';
  }
  return finishDay(state, cal);
}

/** Simulate the remaining fixtures today and run end-of-day processing. */
export function finishDay(state: GameState, cal = calendarFor(state)): StopReason {
  const newsBefore = state.nextId.news;
  for (const f of fixturesOn(state, state.day)) {
    if (!state.manager.unemployed && (f.homeId === state.manager.clubId || f.awayId === state.manager.clubId)) continue; // user must play it
    simulateAIFixture(state, f);
  }
  state.pendingUserFixture = null;
  leagueRoundUp(state);
  postFixtureAdvance(state);
  // rivals & notable results news
  dailyPlayerUpdate(state);
  let stop: StopReason = null;
  const d = new Date((state.day) * 86400000 + Date.UTC(2026, 6, 1));
  const dow = d.getUTCDay();
  // transfer window flag
  state.transferWindowOpen = cal.transferWindows.some(([a, b]) => state.day >= a && state.day <= b);
  if (dow === 1) { // Monday: weekly processing
    weeklyFinance(state);
    weeklyTransfers(state);
    if (boardReview(state)) stop = 'sacked';
  }
  processOffersAI(state);
  expireOffers(state);
  if (d.getUTCDate() === 1) { monthlyDevelopment(state); monthlyAwards(state); }
  // deadline day news
  for (const [, b] of cal.transferWindows) if (state.day === b) addNews(state, { category: 'transfer', title: 'Transfer window closes', body: 'The transfer window has now closed. No further permanent signings until it reopens.', important: true });
  if (state.day === cal.transferWindows[1][0]) addNews(state, { category: 'transfer', title: 'January window opens', body: 'The winter transfer window is open until 2 February.', important: true });
  // season end
  if (state.day >= cal.seasonEnd) {
    seasonRollover(state);
    return 'season';
  }
  state.day++;
  if (state.news.some((n) => n.id >= newsBefore && n.important)) stop = stop ?? 'inbox';
  if (state.offers.some((o) => o.status === 'pending' && (o.isUserSale || (o.isUserBid && o.response)))) stop = stop ?? 'offer';
  return stop;
}

/** After the user's league completes a matchday, post a round-up with results and table movement. */
function leagueRoundUp(state: GameState) {
  if (state.manager.unemployed) return;
  const club = state.clubs[state.manager.clubId];
  const league = state.competitions[club.leagueId ?? ''];
  if (!league || league.type !== 'league') return;
  const today = Object.values(state.fixtures).filter((f) => f.compId === league.id && f.day === state.day && f.played);
  if (!today.length) return;
  const stage = today[0].stage;
  const round = league.seasonFixtures.map((id) => state.fixtures[id]).filter((f) => f.stage === stage);
  if (!round.every((f) => f.played)) return;
  if (round.some((f) => f.day !== state.day && f.day > state.day)) return;
  const order = leagueOrder(league, state.clubs);
  const pos = order.indexOf(club.id) + 1;
  const lines = round.slice().sort((a, b) => a.day - b.day).map((f) => `${state.clubs[f.homeId].short} ${f.result!.hg}–${f.result!.ag} ${state.clubs[f.awayId].short}`);
  const top = order.slice(0, 3).map((id, i) => `${i + 1}. ${state.clubs[id].short} ${league.standings!.find((s) => s.clubId === id)!.pts}`).join(' · ');
  const mine = round.find((f) => f.homeId === club.id || f.awayId === club.id);
  const myLine = mine ? (mine.result!.winnerId === club.id ? 'a win' : mine.result!.winnerId === null ? 'a draw' : 'a defeat') : 'no game';
  addNews(state, { category: 'competition', title: `${league.short} ${today[0].stageName} round-up`, body: `${lines.join(' · ')}. After ${myLine}, ${club.short} sit ${pos}${['st', 'nd', 'rd'][pos - 1] ?? 'th'}. Top: ${top}.`, clubId: club.id });
}

function dailyPlayerUpdate(state: GameState) {
  const rng = new RNG(hashString(`${state.seed}-daily-${state.day}`));
  for (const p of Object.values(state.players)) {
    if (p.clubId === null) continue;
    if (p.injury) {
      p.injury.daysLeft--;
      if (p.injury.daysLeft <= 0) { p.injury = null; p.sharpness = clamp(p.sharpness - 15, 30, 100); if (p.clubId === state.manager.clubId) addNews(state, { category: 'injury', title: `${p.name} back in training`, body: `${p.name} has recovered from injury and is available for selection.`, playerId: p.id }); }
      p.condition = clamp(p.condition + 4, 0, 100);
      continue;
    }
    const club = state.clubs[p.clubId];
    const rest = club?.training === 'rest' ? 1.4 : 1;
    p.condition = clamp(p.condition + (8 + p.attrs.stamina * 0.25) * rest, 0, 100);
    p.sharpness = clamp(p.sharpness - 0.6, 0, 100);
    // training injuries
    if (rng.chance(0.0005 * (club?.training === 'physical' ? 1.4 : 1))) {
      const days = rng.int(3, 25);
      p.injury = { type: rng.pick(['training knock', 'muscle strain', 'ankle sprain', 'back spasm']), daysLeft: days, totalDays: days };
      if (p.clubId === state.manager.clubId) addNews(state, { category: 'injury', title: `${p.name} injured in training`, body: `${p.name} will be out for around ${days} days with a ${p.injury.type}.`, playerId: p.id, important: days >= 14 });
    }
    // morale drift toward baseline
    const base = 60 + (club ? (club.fanHappiness - 50) * 0.3 : 0);
    p.morale = clamp(p.morale + (base - p.morale) * 0.02, 5, 100);
    if (p.unhappy > 0) p.unhappy = Math.max(0, p.unhappy - 0.3);
  }
}

function boardReview(state: GameState): boolean {
  if (state.manager.unemployed) return false;
  const club = state.clubs[state.manager.clubId];
  const league = state.competitions[club.leagueId ?? ''];
  if (!league || league.type !== 'league') return false;
  const order = leagueOrder(league, state.clubs);
  const pos = order.indexOf(club.id) + 1;
  const row = league.standings!.find((s) => s.clubId === club.id)!;
  if (row.p < 5) return false;
  const target = expectationRank(club.expectation);
  const delta = target - pos; // positive = ahead of expectation
  const formPts = row.form.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
  const adj = clamp(delta * 0.6 + (formPts - 8) * 0.35, -6, 6);
  club.boardConfidence = clamp(club.boardConfidence + adj, 0, 100);
  if (club.boardConfidence < 15 && row.p >= 12) {
    addNews(state, { category: 'board', title: 'You have been sacked', body: `The board of ${club.name} has relieved you of your duties following a run of poor results. You will receive offers from other clubs shortly.`, important: true, clubId: club.id });
    state.manager.unemployed = true;
    return true;
  }
  if (club.boardConfidence < 30 && state.day % 28 === 0) addNews(state, { category: 'board', title: 'Board losing patience', body: `The board expects ${club.expectation === 'title' ? 'a title challenge' : club.expectation === 'top4' ? 'Champions League qualification' : club.expectation === 'europe' ? 'European qualification' : club.expectation === 'midtable' ? 'a comfortable mid-table finish' : 'survival'} and is concerned about recent results.`, important: true, clubId: club.id });
  return false;
}

function monthlyAwards(state: GameState) {
  // Player of the month per top-5 league: best avg rating over last month among players with >= 3 apps (approximation: use ALL stats delta not tracked -> use form)
  const rng = new RNG(hashString(`${state.seed}-awards-${state.day}`));
  for (const lid of ['ENG1', 'ESP1', 'GER1', 'ITA1', 'FRA1']) {
    const comp = state.competitions[lid]; if (!comp) continue;
    const cands: { p: Player; score: number }[] = [];
    for (const cid of comp.teams) for (const pid of state.clubs[cid].players) {
      const p = state.players[pid]; if (!p || p.form.length < 3) continue;
      const avg = p.form.reduce((s, v) => s + v, 0) / p.form.length;
      cands.push({ p, score: avg + rng.float(0, 0.2) });
    }
    cands.sort((a, b) => b.score - a.score);
    const best = cands[0]; if (!best) continue;
    const label = seasonLabel(state.seasonYear);
    state.awards.push({ season: label, name: `${comp.name} Player of the Month`, playerId: best.p.id, playerName: best.p.name, clubId: best.p.clubId!, detail: `avg rating ${(best.score - 0.1).toFixed(2)}` });
    if (best.p.clubId === state.manager.clubId) addNews(state, { category: 'award', title: `${best.p.name} named Player of the Month`, body: `${best.p.name} has been named ${comp.name} Player of the Month.`, playerId: best.p.id });
    best.p.morale = clamp(best.p.morale + 8, 0, 100);
  }
}

// ───────────────────────── season rollover ─────────────────────────
export function seasonRollover(state: GameState) {
  const label = seasonLabel(state.seasonYear);
  endOfSeasonAwards(state);
  buildSeasonReview(state, label);
  prizeMoneyEndOfSeason(state);
  endSeason(state);
  // career entries
  for (const p of Object.values(state.players)) {
    const s = p.stats['ALL'];
    if (s && s.apps > 0 && p.clubId !== null) p.career.push({ season: label, clubId: p.clubId, clubName: state.clubs[p.clubId]?.name ?? '', apps: s.apps, goals: s.goals, assists: s.assists, avgRating: Math.round((s.ratingSum / s.apps) * 100) / 100 });
    if (p.career.length > 20) p.career.shift();
  }
  endOfSeasonDevelopment(state);
  retirements(state);
  contractExpiry(state);
  youthIntake(state);
  // manager history
  const club = state.clubs[state.manager.clubId];
  const league = state.competitions[club.leagueId ?? ''];
  const pos = league?.type === 'league' ? leagueOrder(league, state.clubs).indexOf(club.id) + 1 : null;
  const honours = Object.values(state.competitions).filter((c) => c.winnerId === club.id).map((c) => c.name);
  state.manager.history.push({ season: label, clubId: club.id, clubName: club.name, leaguePos: pos, honours });
  state.manager.seasonsInCharge++;
  state.manager.reputation = clamp(state.manager.reputation + (pos ? (expectationRank(club.expectation) - pos) * 0.8 : 0) + honours.length * 4, 1, 100);
  // next season
  state.seasonYear++;
  state.day = calendarFor(state).seasonStart;
  // refresh values with new ages
  for (const p of Object.values(state.players)) { const age = ageOn(p.born, p.bornDay, state.day, state.seasonYear); p.value = calcValue(p.ovr, age, p.pot, p.pos); }
  startSeason(state);
  const c2 = state.clubs[state.manager.clubId];
  c2.boardConfidence = clamp(c2.boardConfidence, 35, 100);
  addNews(state, { category: 'board', title: `Season ${label} review`, body: `${club.name} finished ${pos ? `${pos}${['st', 'nd', 'rd'][pos - 1] ?? 'th'}` : 'the season'} in the league${honours.length ? ` and won: ${honours.join(', ')}` : ''}. The board's expectation for the new season: ${c2.expectation}.`, important: true });
}

function buildSeasonReview(state: GameState, label: string) {
  const club = state.clubs[state.manager.clubId];
  const league = state.competitions[club.leagueId ?? ''];
  if (!league || league.type !== 'league') { state.seasonReview = null; return; }
  const order = leagueOrder(league, state.clubs);
  const table = order.map((id) => { const r = league.standings!.find((s) => s.clubId === id)!; return { clubId: id, p: r.p, w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga, pts: r.pts - r.deduction }; });
  const mine = Object.values(state.fixtures).filter((f) => f.played && (f.homeId === club.id || f.awayId === club.id));
  const record = { w: 0, d: 0, l: 0, gf: 0, ga: 0, apps: mine.length };
  for (const f of mine) { const home = f.homeId === club.id; const gf = home ? f.result!.hg : f.result!.ag, ga = home ? f.result!.ag : f.result!.hg; record.gf += gf; record.ga += ga; if (gf > ga) record.w++; else if (gf === ga) record.d++; else record.l++; }
  const honours = Object.values(state.competitions).filter((c) => c.winnerId === club.id).map((c) => c.name);
  const cupRuns = Object.values(state.competitions).filter((c) => c.type !== 'league' && c.teams.includes(club.id) && c.winnerId !== club.id).map((c) => {
    const my = c.seasonFixtures.map((id) => state.fixtures[id]).filter((f) => f.played && (f.homeId === club.id || f.awayId === club.id)).sort((a, b) => b.day - a.day)[0];
    return { comp: c.name, stage: my ? `out in ${my.stageName.replace(/ (1st|2nd) leg/, '')}${c.runnerUpId === club.id ? ' (runner-up)' : ''}` : 'did not play' };
  });
  const squad = club.players.map((id) => state.players[id]).filter((p) => p && p.stats['ALL']);
  const ts = squad.slice().sort((a, b) => b.stats['ALL'].goals - a.stats['ALL'].goals)[0];
  const bp = squad.filter((p) => p.stats['ALL'].apps >= 10).sort((a, b) => b.stats['ALL'].ratingSum / b.stats['ALL'].apps - a.stats['ALL'].ratingSum / a.stats['ALL'].apps)[0];
  const pos = order.indexOf(club.id) + 1;
  const target = expectationRank(club.expectation);
  const verdict = pos <= Math.max(1, target - 2) ? 'The board is delighted — this went well beyond what was asked.' : pos <= target ? 'The board is satisfied: expectations were met.' : pos <= target + 3 ? 'The board expected more, but sees enough to keep faith.' : 'The board is unhappy with a season that fell well short of expectations.';
  state.seasonReview = {
    season: label, clubId: club.id, clubName: club.name, leagueName: league.name, position: pos, table, record, honours, cupRuns,
    awards: state.awards.filter((a) => a.season === label && a.clubId === club.id && !a.name.includes('Month')).map((a) => ({ name: a.name, playerName: a.playerName, detail: a.detail })),
    topScorer: ts ? { name: ts.name, goals: ts.stats['ALL'].goals } : null,
    bestPlayer: bp ? { name: bp.name, avg: Math.round((bp.stats['ALL'].ratingSum / bp.stats['ALL'].apps) * 100) / 100 } : null,
    boardVerdict: verdict, seen: false,
  };
}

function endOfSeasonAwards(state: GameState) {
  const label = seasonLabel(state.seasonYear);
  const all = Object.values(state.players).filter((p) => p.clubId !== null && p.stats['ALL']);
  const push = (name: string, p: Player | undefined, detail: string) => { if (p) state.awards.push({ season: label, name, playerId: p.id, playerName: p.name, clubId: p.clubId!, detail }); };
  const byGoals = all.slice().sort((a, b) => (b.stats['ALL']?.goals ?? 0) - (a.stats['ALL']?.goals ?? 0));
  push('World Golden Boot', byGoals[0], `${byGoals[0]?.stats['ALL']?.goals ?? 0} goals`);
  const eligible = all.filter((p) => (p.stats['ALL']?.apps ?? 0) >= 25);
  const byRating = eligible.slice().sort((a, b) => (b.stats['ALL']!.ratingSum / b.stats['ALL']!.apps + (b.stats['ALL']!.goals + b.stats['ALL']!.assists) * 0.012) - (a.stats['ALL']!.ratingSum / a.stats['ALL']!.apps + (a.stats['ALL']!.goals + a.stats['ALL']!.assists) * 0.012));
  push("Ballon d'Or", byRating[0], `avg ${(byRating[0] ? byRating[0].stats['ALL']!.ratingSum / byRating[0].stats['ALL']!.apps : 0).toFixed(2)}`);
  const young = eligible.filter((p) => state.seasonYear - p.born <= 21).sort((a, b) => b.stats['ALL']!.ratingSum / b.stats['ALL']!.apps - a.stats['ALL']!.ratingSum / a.stats['ALL']!.apps);
  push('Golden Boy', young[0], `avg ${(young[0] ? young[0].stats['ALL']!.ratingSum / young[0].stats['ALL']!.apps : 0).toFixed(2)}`);
  const gks = eligible.filter((p) => p.pos === 'GK').sort((a, b) => b.stats['ALL']!.cleanSheets - a.stats['ALL']!.cleanSheets);
  push('Golden Glove', gks[0], `${gks[0]?.stats['ALL']?.cleanSheets ?? 0} clean sheets`);
  for (const lid of ['ENG1', 'ESP1', 'GER1', 'ITA1', 'FRA1']) {
    const comp = state.competitions[lid]; if (!comp) continue;
    const ids = new Set(comp.teams.flatMap((cid) => state.clubs[cid].players));
    const lp = all.filter((p) => ids.has(p.id) && p.stats[lid]);
    const ts = lp.slice().sort((a, b) => b.stats[lid].goals - a.stats[lid].goals)[0];
    push(`${comp.name} Top Scorer`, ts, `${ts?.stats[lid].goals ?? 0} goals`);
    const poy = lp.filter((p) => p.stats[lid].apps >= 20).sort((a, b) => b.stats[lid].ratingSum / b.stats[lid].apps - a.stats[lid].ratingSum / a.stats[lid].apps)[0];
    push(`${comp.name} Player of the Season`, poy, `avg ${(poy ? poy.stats[lid].ratingSum / poy.stats[lid].apps : 0).toFixed(2)}`);
    const h = state.honours.find((x) => x.compId === lid && x.season === label);
    if (h && ts) h.topScorer = { playerId: ts.id, goals: ts.stats[lid].goals };
  }
  const mineAwards = state.awards.filter((a) => a.season === label && a.clubId === state.manager.clubId);
  if (mineAwards.length) addNews(state, { category: 'award', title: 'End of season awards', body: mineAwards.map((a) => `${a.name}: ${state.players[a.playerId]?.name} (${a.detail})`).join('. '), important: true });
}

export function isPlayerAvailable(p: Player, compId: string) { return isAvailable(p, compId); }
