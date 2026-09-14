import { Club, Competition, GameState, NewsItem, Player, Pos } from './types';
import { RNG, hashString, clamp } from './rng';
import { buildCalendar, SeasonCalendar } from './calendar';
import { createLeague, createCup, createEuroLeaguePhase, drawCupStage, CupStageDef, leagueOrder } from './competitions';
import { LAST_SEASON_ORDER, LAST_SEASON_CUPS, LAST_SEASON_EURO, LAST_SEASON_OTHER } from './data/season2026';
import { NATIONS } from './data/nations';
import { seasonLabel } from './attributes';
import { LEAGUE_IDS, LEAGUE_NATION, generatePlayer } from './world';
import { bestFormation } from './tactics';
import { generateAttributes, calcOverall, calcValue, calcWage } from './attributes';

export const LEAGUE_META: Record<string, { name: string; short: string; color: string; rep: number; prize: number }> = {
  ENG1: { name: 'Premier League', short: 'PL', color: '#3D195B', rep: 96, prize: 180e6 },
  ESP1: { name: 'La Liga', short: 'LaLiga', color: '#EE8707', rep: 90, prize: 120e6 },
  GER1: { name: 'Bundesliga', short: 'BL', color: '#D3010C', rep: 86, prize: 90e6 },
  ITA1: { name: 'Serie A', short: 'SA', color: '#024494', rep: 87, prize: 90e6 },
  FRA1: { name: 'Ligue 1', short: 'L1', color: '#091C3E', rep: 80, prize: 70e6 },
};
export const CUP_META: Record<string, { name: string; short: string; nation: string; color: string; rep: number; prize: number }> = {
  ENG_FAC: { name: 'FA Cup', short: 'FAC', nation: 'ENG', color: '#B8202E', rep: 80, prize: 4e6 },
  ENG_EFL: { name: 'EFL Cup', short: 'EFL', nation: 'ENG', color: '#00A88E', rep: 65, prize: 1.5e6 },
  ESP_CDR: { name: 'Copa del Rey', short: 'CdR', nation: 'ESP', color: '#C8102E', rep: 75, prize: 3e6 },
  GER_POK: { name: 'DFB-Pokal', short: 'POK', nation: 'GER', color: '#0A5C36', rep: 75, prize: 4.3e6 },
  ITA_CIT: { name: 'Coppa Italia', short: 'CIT', nation: 'ITA', color: '#1D4F91', rep: 72, prize: 4.5e6 },
  FRA_CDF: { name: 'Coupe de France', short: 'CdF', nation: 'FRA', color: '#0B3D91', rep: 70, prize: 2e6 },
  ENG_CS: { name: 'Community Shield', short: 'CS', nation: 'ENG', color: '#B8202E', rep: 50, prize: 1e6 },
  GER_SC: { name: 'DFL-Supercup', short: 'DSC', nation: 'GER', color: '#D3010C', rep: 50, prize: 1e6 },
  ESP_SC: { name: 'Supercopa de España', short: 'SCE', nation: 'ESP', color: '#EE8707', rep: 55, prize: 8e6 },
  ITA_SC: { name: 'Supercoppa Italiana', short: 'SCI', nation: 'ITA', color: '#024494', rep: 55, prize: 8e6 },
  FRA_TC: { name: 'Trophée des Champions', short: 'TdC', nation: 'FRA', color: '#091C3E', rep: 45, prize: 1e6 },
};
export const EURO_META = {
  UCL: { name: 'UEFA Champions League', short: 'UCL', color: '#0E1E5B', rep: 100, prize: 25e6 },
  UEL: { name: 'UEFA Europa League', short: 'UEL', color: '#F68B1F', rep: 85, prize: 10e6 },
  UECL: { name: 'UEFA Conference League', short: 'UECL', color: '#2AA98A', rep: 70, prize: 5e6 },
  USC: { name: 'UEFA Super Cup', short: 'USC', color: '#7A1FA2', rep: 60, prize: 5e6 },
};

export function calendarFor(state: GameState): SeasonCalendar { return buildCalendar(state.seasonYear); }

export function clubByName(state: GameState, name: string): Club | undefined {
  return Object.values(state.clubs).find((c) => c.name === name);
}

export function addNews(state: GameState, item: Omit<NewsItem, 'id' | 'read' | 'day'> & { day?: number }): NewsItem {
  const n: NewsItem = { id: state.nextId.news++, read: false, day: item.day ?? state.day, ...item };
  state.news.unshift(n);
  if (state.news.length > 400) state.news.length = 400;
  return n;
}

// ───────────────────────── European entrants ─────────────────────────
interface EuroEntrants { UCL: number[]; UEL: number[]; UECL: number[]; }

function lastOrder(state: GameState, compId: string): number[] {
  const stored = state.lastSeasonTables[compId];
  if (stored && stored.length) return stored.filter((id) => state.clubs[id]);
  const names = LAST_SEASON_ORDER[compId] ?? LAST_SEASON_OTHER[compId] ?? [];
  return names.map((n) => clubByName(state, n)?.id).filter((x): x is number => x !== undefined);
}
function lastCupWinner(state: GameState, compId: string): { winner: number | null; finalist: number | null } {
  const rec = state.lastCupResults?.[compId];
  if (rec) return rec;
  const d = LAST_SEASON_CUPS[compId] ?? LAST_SEASON_EURO[compId];
  return { winner: d ? clubByName(state, d.winner)?.id ?? null : null, finalist: d ? clubByName(state, d.finalist)?.id ?? null : null };
}

export function computeEuroEntrants(state: GameState, rng: RNG): EuroEntrants {
  const UCL: number[] = [], UEL: number[] = [], UECL: number[] = [];
  const taken = new Set<number>();
  const add = (list: number[], id: number | null | undefined) => { if (id === null || id === undefined || taken.has(id)) return false; list.push(id); taken.add(id); return true; };
  // Holders
  const uclHolder = lastCupWinner(state, 'UCL').winner, uelHolder = lastCupWinner(state, 'UEL').winner, ueclHolder = lastCupWinner(state, 'UECL').winner;
  // EPS: two best nations by coefficient
  const coeffs = LEAGUE_IDS.map((l) => [LEAGUE_NATION[l], state.euroCoefficients[LEAGUE_NATION[l]] ?? NATIONS[LEAGUE_NATION[l]].coefficient] as [string, number]).sort((a, b) => b[1] - a[1]);
  const eps = new Set(coeffs.slice(0, 2).map((x) => x[0]));
  const cupOf: Record<string, string> = { ENG: 'ENG_FAC', ESP: 'ESP_CDR', GER: 'GER_POK', ITA: 'ITA_CIT', FRA: 'FRA_CDF' };
  add(UCL, uclHolder); add(UCL, uelHolder); add(UEL, ueclHolder);
  for (const lid of LEAGUE_IDS) {
    const nation = LEAGUE_NATION[lid];
    const order = lastOrder(state, lid).filter((id) => state.clubs[id].tier === 1 || true);
    const uclSlots = (nation === 'FRA' ? 3 : 4) + (eps.has(nation) ? 1 : 0);
    let i = 0;
    let filled = 0;
    // holders already in the list still occupy their league place: count them
    for (; i < order.length && filled < uclSlots; i++) { if (taken.has(order[i]) && UCL.includes(order[i])) { filled++; continue; } if (add(UCL, order[i])) filled++; }
    // UEL: next league place + cup winner
    let uelFilled = 0;
    const cupW = lastCupWinner(state, cupOf[nation]).winner;
    if (cupW && !taken.has(cupW)) { add(UEL, cupW); uelFilled++; }
    for (; i < order.length && uelFilled < 2; i++) { if (taken.has(order[i])) continue; if (add(UEL, order[i])) uelFilled++; }
    // UECL: next league place (England: EFL Cup winner)
    let ueclFilled = 0;
    if (nation === 'ENG') { const efl = lastCupWinner(state, 'ENG_EFL').winner; if (efl && !taken.has(efl)) { add(UECL, efl); ueclFilled++; } }
    for (; i < order.length && ueclFilled < 1; i++) { if (taken.has(order[i])) continue; if (add(UECL, order[i])) ueclFilled++; }
  }
  // Other nations
  const others = Object.values(state.clubs).filter((c) => !LEAGUE_IDS.includes(c.leagueId as any) && NATIONS[c.nation]?.uefa && c.tier === 1 && !taken.has(c.id));
  const scored = others.map((c) => {
    const order = lastOrder(state, c.leagueId ?? '');
    const pos = order.indexOf(c.id);
    const natCoeff = NATIONS[c.nation]?.coefficient ?? 10;
    let score = c.reputation + natCoeff * 0.35 + rng.float(0, 6);
    if (pos === 0) score += 14; else if (pos === 1) score += 7; else if (pos === 2) score += 3; else if (pos < 0) score -= 6;
    return { c, score, pos };
  }).sort((a, b) => b.score - a.score);
  const champions = scored.filter((x) => x.pos === 0);
  // UCL: fill with best others (champions strongly preferred)
  let k = 0;
  while (UCL.length < 36 && k < scored.length) { const x = scored[k++]; if (x.pos !== 0 && x.score < 70) continue; add(UCL, x.c.id); }
  k = 0;
  while (UCL.length < 36 && k < scored.length) add(UCL, scored[k++].c.id);
  k = 0;
  while (UEL.length < 36 && k < scored.length) add(UEL, scored[k++].c.id);
  k = 0;
  while (UECL.length < 36 && k < scored.length) add(UECL, scored[k++].c.id);
  void champions;
  return { UCL: UCL.slice(0, 36), UEL: UEL.slice(0, 36), UECL: UECL.slice(0, 36) };
}

function makePots(state: GameState, teams: number[], nPots: number, holder: number | null): Record<number, number> {
  const sorted = teams.slice().sort((a, b) => state.clubs[b].coefficient - state.clubs[a].coefficient);
  if (holder && sorted.includes(holder)) { sorted.splice(sorted.indexOf(holder), 1); sorted.unshift(holder); }
  const potSize = Math.ceil(teams.length / nPots);
  const pots: Record<number, number> = {};
  sorted.forEach((id, i) => (pots[id] = Math.min(nPots, Math.floor(i / potSize) + 1)));
  return pots;
}

// ───────────────────────── season creation ─────────────────────────
export function startSeason(state: GameState) {
  const cal = buildCalendar(state.seasonYear);
  const rng = new RNG(hashString(`season-${state.seasonYear}-${state.seed}`));
  const label = seasonLabel(state.seasonYear);
  // wipe last season's competitions & fixtures
  state.competitions = {};
  state.fixtures = {};
  // reset season stats
  for (const p of Object.values(state.players)) { p.stats = {}; p.yellowsInComp = {}; p.suspension = {}; p.form = []; }
  for (const c of Object.values(state.clubs)) { c.seasonPoints = 0; }

  // Leagues
  for (const lid of LEAGUE_IDS) {
    const meta = LEAGUE_META[lid];
    const teams = Object.values(state.clubs).filter((c) => c.leagueId === lid).map((c) => c.id);
    createLeague(state, cal, lid, meta.name, meta.short, LEAGUE_NATION[lid], teams, rng, meta.prize, meta.color, meta.rep);
  }
  const clubsIn = (nation: string, tiers: number[]) => Object.values(state.clubs).filter((c) => c.nation === nation && tiers.includes(c.tier)).map((c) => c.id);
  const lastCup = (id: string) => lastCupWinner(state, id);
  const ord = (lid: string) => lastOrder(state, lid);

  // Europe
  const euro = computeEuroEntrants(state, rng);
  const uclHolder = lastCup('UCL').winner, uelHolder = lastCup('UEL').winner, ueclHolder = lastCup('UECL').winner;
  createEuroLeaguePhase(state, cal, 'UCL', EURO_META.UCL.name, 'UCL', euro.UCL, makePots(state, euro.UCL, 4, uclHolder), cal.ucl.md, cal.ucl, rng, EURO_META.UCL.prize, EURO_META.UCL.color, EURO_META.UCL.rep, 4, 9, 2);
  createEuroLeaguePhase(state, cal, 'UEL', EURO_META.UEL.name, 'UEL', euro.UEL, makePots(state, euro.UEL, 4, uelHolder), cal.uel.md, cal.uel, rng, EURO_META.UEL.prize, EURO_META.UEL.color, EURO_META.UEL.rep, 4, 9, 2);
  createEuroLeaguePhase(state, cal, 'UECL', EURO_META.UECL.name, 'UECL', euro.UECL, makePots(state, euro.UECL, 6, ueclHolder), cal.uecl.md, cal.uecl, rng, EURO_META.UECL.prize, EURO_META.UECL.color, EURO_META.UECL.rep, 6, 6, 1);
  const inEurope = new Set([...euro.UCL, ...euro.UEL, ...euro.UECL]);

  // UEFA Super Cup
  {
    const a = uclHolder ?? euro.UCL[0], b = uelHolder && uelHolder !== a ? uelHolder : euro.UEL.find((x) => x !== a)!;
    const comp = createCup(state, 'USC', EURO_META.USC.name, 'USC', null, 'supercup', [{ name: 'Final', twoLegged: false, neutral: true, extraTime: true }], [cal.uefaSuperCup], [null], [[a, b]], EURO_META.USC.prize, EURO_META.USC.color, EURO_META.USC.rep, [a, b]);
    drawCupStage(state, cal, comp, 0, rng, [[a, b]]);
  }

  // Domestic super cups (August ones)
  const superCup2 = (id: string, champion: number | null, cupWinner: number | null, fallback: number[], day: number) => {
    const a = champion ?? fallback[0];
    let b = cupWinner && cupWinner !== a ? cupWinner : fallback.find((x) => x !== a)!;
    const meta = CUP_META[id];
    const comp = createCup(state, id, meta.name, meta.short, meta.nation, 'supercup', [{ name: 'Final', twoLegged: false, neutral: true, extraTime: false }], [day], [null], [[a, b]], meta.prize, meta.color, meta.rep, [a, b]);
    drawCupStage(state, cal, comp, 0, rng, [[a, b]]);
  };
  superCup2('ENG_CS', ord('ENG1')[0], lastCup('ENG_FAC').winner, ord('ENG1'), cal.supercups.ENG_CS[0]);
  superCup2('GER_SC', ord('GER1')[0], lastCup('GER_POK').winner, ord('GER1'), cal.supercups.GER_SC[0]);
  // January ones
  superCup2('FRA_TC', ord('FRA1')[0], lastCup('FRA_CDF').winner, ord('FRA1'), cal.supercups.FRA_TC[0]);
  const superCup4 = (id: string, lid: string, cupId: string) => {
    const o = ord(lid); const cw = lastCup(cupId);
    const list: number[] = [];
    const push = (x: number | null | undefined) => { if (x !== null && x !== undefined && !list.includes(x)) list.push(x); };
    push(o[0]); push(cw.winner); push(o[1]); push(cw.finalist); for (const x of o) { if (list.length >= 4) break; push(x); }
    const teams = list.slice(0, 4);
    const meta = CUP_META[id];
    const comp = createCup(state, id, meta.name, meta.short, meta.nation, 'supercup', [{ name: 'Semi-final', twoLegged: false, neutral: true, extraTime: true }, { name: 'Final', twoLegged: false, neutral: true, extraTime: true }], cal.supercups[id], [null, null], [teams, []], meta.prize, meta.color, meta.rep, teams);
    drawCupStage(state, cal, comp, 0, rng, [[teams[0], teams[3]], [teams[1], teams[2]]]);
    return teams;
  };
  const supercopa = superCup4('ESP_SC', 'ESP1', 'ESP_CDR');
  superCup4('ITA_SC', 'ITA1', 'ITA_CIT');

  // Domestic cups
  const single = (name: string, lowerHosts = false, neutral = false): CupStageDef => ({ name, twoLegged: false, neutral, extraTime: true, lowerHosts });
  const twoLeg = (name: string): CupStageDef => ({ name, twoLegged: true, neutral: false, extraTime: true });
  const mk = (id: string, defs: CupStageDef[], entrants: number[][], teams: number[]) => {
    const meta = CUP_META[id];
    const comp = createCup(state, id, meta.name, meta.short, meta.nation, 'cup', defs, cal.cups[id], cal.cups2[id], entrants, meta.prize, meta.color, meta.rep, teams);
    drawCupStage(state, cal, comp, 0, rng);
    return comp;
  };
  // England
  {
    const pl = clubsIn('ENG', [1]), champ = clubsIn('ENG', [2]), lower = rng.shuffle(clubsIn('ENG', [3, 4]));
    mk('ENG_FAC', [single('Third Round'), single('Fourth Round'), single('Fifth Round'), single('Quarter-final'), single('Semi-final', false, true), single('Final', false, true)], [[...pl, ...champ, ...lower.slice(0, 64 - pl.length - champ.length)], [], [], [], [], []], [...pl, ...champ, ...lower]);
    const euroPl = pl.filter((id) => inEurope.has(id)), nonEuro = pl.filter((id) => !inEurope.has(id));
    const r2Size = 2 * (32 - euroPl.length);
    const lowerPool = rng.shuffle([...champ, ...lower]);
    const r2 = [...nonEuro, ...lowerPool.slice(0, Math.max(0, r2Size - nonEuro.length))];
    mk('ENG_EFL', [single('Second Round', true), single('Third Round', true), single('Fourth Round'), single('Quarter-final'), twoLeg('Semi-final'), single('Final', false, true)], [r2, euroPl, [], [], [], []], [...r2, ...euroPl]);
  }
  // Spain
  {
    const liga = clubsIn('ESP', [1]), lower = rng.shuffle(clubsIn('ESP', [2, 3]));
    const nonSC = liga.filter((id) => !supercopa.includes(id));
    const r1 = [...nonSC, ...lower.slice(0, 56 - nonSC.length)];
    const r32extra = lower.slice(56 - nonSC.length, 56 - nonSC.length + (32 - 14 - supercopa.length));
    mk('ESP_CDR', [single('First Round', true), single('Second Round', true), single('Round of 32', true), single('Round of 16', true), single('Quarter-final', true), twoLeg('Semi-final'), single('Final', false, true)], [r1, [], [...supercopa, ...r32extra], [], [], [], []], [...r1, ...supercopa, ...r32extra]);
  }
  // Germany
  {
    const bl = clubsIn('GER', [1]), bl2 = clubsIn('GER', [2]), lower = rng.shuffle(clubsIn('GER', [3]));
    const r1 = [...bl, ...bl2, ...lower.slice(0, 64 - bl.length - bl2.length)];
    mk('GER_POK', [single('First Round', true), single('Second Round', true), single('Round of 16', true), single('Quarter-final'), single('Semi-final'), single('Final', false, true)], [r1, [], [], [], [], []], r1);
  }
  // Italy
  {
    const sa = clubsIn('ITA', [1]); const o = ord('ITA1');
    const ranked = [...o.filter((id) => sa.includes(id)), ...sa.filter((id) => !o.includes(id))];
    const top8 = ranked.slice(0, 8), rest = ranked.slice(8);
    const lower = rng.shuffle(clubsIn('ITA', [2, 3]));
    const r1 = [...rest, ...lower.slice(0, 32 - rest.length)];
    mk('ITA_CIT', [single('First Round'), single('Second Round'), single('Round of 16'), single('Quarter-final'), twoLeg('Semi-final'), single('Final', false, true)], [r1, [], top8, [], [], []], [...r1, ...top8]);
  }
  // France
  {
    const l1 = clubsIn('FRA', [1]), lower = rng.shuffle(clubsIn('FRA', [2, 3]));
    const r64 = [...l1, ...lower.slice(0, 64 - l1.length)];
    mk('FRA_CDF', [single('Round of 64', true), single('Round of 32', true), single('Round of 16', true), single('Quarter-final', true), single('Semi-final'), single('Final', false, true)], [r64, [], [], [], [], []], r64);
  }

  // budgets & expectations
  for (const c of Object.values(state.clubs)) {
    if (c.leagueId && LEAGUE_IDS.includes(c.leagueId as any)) {
      const order = ord(c.leagueId);
      const pos = order.indexOf(c.id);
      const rank = pos < 0 ? 18 : pos + 1;
      c.expectation = c.reputation >= 90 ? 'title' : c.reputation >= 84 ? 'top4' : c.reputation >= 76 || rank <= 6 ? 'europe' : c.reputation >= 66 ? 'midtable' : 'survival';
    }
  }
  for (const c of Object.values(state.clubs)) if (c.id !== state.manager.clubId) c.tactic.formation = bestFormation(c, state.players);
  state.transferWindowOpen = true;
  addNews(state, { category: 'general', title: `Welcome to the ${label} season`, body: `Fixtures are out. ${state.clubs[state.manager.clubId].name} begin the campaign in the ${state.competitions[state.clubs[state.manager.clubId].leagueId!]?.name ?? 'league'}${inEurope.has(state.manager.clubId) ? ` and will also compete in the ${euro.UCL.includes(state.manager.clubId) ? 'Champions League' : euro.UEL.includes(state.manager.clubId) ? 'Europa League' : 'Conference League'}` : ''}. The summer transfer window is open until ${'1 September'}.`, important: true });
}

// ───────────────────────── season end ─────────────────────────
export function endSeason(state: GameState) {
  const rng = new RNG(hashString(`end-${state.seasonYear}-${state.seed}`));
  const label = seasonLabel(state.seasonYear);
  const lastCupResults: Record<string, { winner: number | null; finalist: number | null }> = {};
  const tables: Record<string, number[]> = {};
  // Record honours
  for (const comp of Object.values(state.competitions)) {
    if (comp.type === 'league') {
      const order = leagueOrder(comp, state.clubs);
      tables[comp.id] = order;
      comp.winnerId = order[0]; comp.runnerUpId = order[1];
    }
    if (comp.winnerId) {
      state.clubs[comp.winnerId].honours.push({ season: label, compId: comp.id, compName: comp.name });
      lastCupResults[comp.id] = { winner: comp.winnerId, finalist: comp.runnerUpId ?? null };
      state.honours.push({ season: label, compId: comp.id, compName: comp.name, winnerId: comp.winnerId, runnerUpId: comp.runnerUpId ?? null });
    }
  }
  state.lastCupResults = lastCupResults;
  // Other nations: abstract league order by reputation + noise
  const otherLeagues = new Set(Object.values(state.clubs).filter((c) => c.leagueId && !LEAGUE_IDS.includes(c.leagueId as any) && c.tier === 1).map((c) => c.leagueId!));
  for (const lid of otherLeagues) {
    const teams = Object.values(state.clubs).filter((c) => c.leagueId === lid).map((c) => ({ id: c.id, s: c.reputation + rng.float(0, 12) }));
    tables[lid] = teams.sort((a, b) => b.s - a.s).map((t) => t.id);
  }
  // Promotion / relegation
  const promoCount: Record<string, number> = { ENG: 3, ESP: 3, GER: 3, ITA: 3, FRA: 3 };
  for (const lid of LEAGUE_IDS) {
    const nation = LEAGUE_NATION[lid];
    const order = tables[lid];
    const n = promoCount[nation];
    const relegated = order.slice(order.length - n);
    const tier2 = Object.values(state.clubs).filter((c) => c.nation === nation && c.tier === 2).map((c) => ({ c, s: c.reputation + rng.float(0, 18) })).sort((a, b) => b.s - a.s);
    const promoted = tier2.slice(0, n).map((x) => x.c);
    for (const id of relegated) { const c = state.clubs[id]; c.tier = 2; c.leagueId = `${nation}2`; c.reputation = Math.max(30, c.reputation - 6); }
    for (const c of promoted) { c.tier = 1; c.leagueId = lid; c.reputation = Math.min(100, c.reputation + 6); boostPromotedSquad(state, c, rng); }
    addNews(state, { category: 'competition', title: `${LEAGUE_META[lid].name}: promotion and relegation`, body: `Relegated: ${relegated.map((id) => state.clubs[id].name).join(', ')}. Promoted: ${promoted.map((c) => c.name).join(', ')}.` });
    // tier-2 clubs relegated to tier 3 and vice versa (keep pools stable): swap bottom tier2 by rep with top tier3
    const t2 = Object.values(state.clubs).filter((c) => c.nation === nation && c.tier === 2 && !promoted.includes(c)).sort((a, b) => a.reputation - b.reputation);
    const t3 = Object.values(state.clubs).filter((c) => c.nation === nation && c.tier === 3).sort((a, b) => b.reputation - a.reputation);
    for (let i = 0; i < Math.min(2, t2.length, t3.length); i++) { if (rng.chance(0.5)) { t2[i].tier = 3; t2[i].leagueId = `${nation}3`; t3[i].tier = 2; t3[i].leagueId = `${nation}2`; } }
  }
  // Coefficient update: nations & clubs from European results
  const nationPts: Record<string, number> = {};
  for (const cid of ['UCL', 'UEL', 'UECL']) {
    const comp = state.competitions[cid]; if (!comp) continue;
    for (const fid of comp.seasonFixtures) {
      const f = state.fixtures[fid]; if (!f.played || !f.result) continue;
      const w = cid === 'UCL' ? 2 : cid === 'UEL' ? 1.6 : 1.2;
      const pts = (id: number) => (f.result!.winnerId === id ? 2 : f.result!.winnerId === null ? 1 : 0) * w;
      for (const id of [f.homeId, f.awayId]) { state.clubs[id].coefficient += pts(id) * 0.5; nationPts[state.clubs[id].nation] = (nationPts[state.clubs[id].nation] ?? 0) + pts(id); }
    }
  }
  for (const c of Object.values(state.clubs)) c.coefficient = Math.max(5, c.coefficient * 0.85 + c.reputation * 0.06);
  for (const [nat, pts] of Object.entries(nationPts)) state.euroCoefficients[nat] = (state.euroCoefficients[nat] ?? NATIONS[nat]?.coefficient ?? 20) * 0.7 + pts * 0.18;
  state.lastSeasonTables = tables;
  state.stats.seasonsPlayed++;
}

export function expectationRank(exp: string): number {
  return exp === 'title' ? 1 : exp === 'top4' ? 4 : exp === 'europe' ? 7 : exp === 'midtable' ? 12 : 17;
}

export function clubStrengthLabel(state: GameState, club: Club): string {
  const order = state.lastSeasonTables[club.leagueId ?? ''] ?? [];
  const pos = order.indexOf(club.id);
  return pos >= 0 ? `${pos + 1}${['st', 'nd', 'rd'][pos] ?? 'th'} last season` : 'newly promoted';
}

export function clubPlayers(state: GameState, club: Club): Player[] { return club.players.map((id) => state.players[id]).filter(Boolean); }
export function activeCompetitionsOf(state: GameState, clubId: number): Competition[] {
  return Object.values(state.competitions).filter((c) => c.teams.includes(clubId));
}
export const clampNum = clamp;

/** Promoted clubs strengthen for the top flight: existing generated players improve and a few new signings arrive. */
export function boostPromotedSquad(state: GameState, club: Club, rng: RNG) {
  const target = 66 + club.reputation * 0.08; // ~70-72 mean for the XI
  const squad = club.players.map((id) => state.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  squad.forEach((p, i) => {
    if (!p.regen || i >= 18) return;
    const want = Math.round(target + 4 - i * 0.55 + rng.normal(0, 1.5));
    if (want <= p.ovr) return;
    const age = state.seasonYear + 1 - p.born;
    p.attrs = generateAttributes(p.name + '+', p.born, p.pos, want, age, rng.int(1, 1e6));
    p.ovr = calcOverall(p.attrs, p.pos); p.pot = Math.max(p.pot, p.ovr);
    p.value = calcValue(p.ovr, age, p.pot, p.pos); p.wage = calcWage(p.ovr, age, club.reputation);
  });
  const n = rng.int(4, 6);
  for (let i = 0; i < n; i++) {
    const pos = rng.pick(['CB', 'CM', 'ST', 'GK', 'LW', 'RW', 'DM', 'RB', 'LB', 'AM'] as Pos[]);
    const p = generatePlayer(state, rng, club.id, club.nation, club.reputation, pos, Math.round(target + 3 + rng.normal(0, 2)), state.day, [22, 30]);
    p.contractEnd = state.seasonYear + 1 + rng.int(2, 4);
    state.players[p.id] = p; club.players.push(p.id);
  }
  club.balance += 40e6; club.transferBudget += 25e6;
}
