import { AttrKey, GameState, Player, Pos, ALL_POS } from './types';
import { RNG, hashString, clamp } from './rng';
import { ATTR_KEYS, POS_WEIGHTS, calcOverall, calcValue, calcWage, ageOn } from './attributes';
import { generatePlayer } from './world';
import { addNews } from './season';
import { contractDemand } from './transfers';

const PHYS: AttrKey[] = ['pace', 'acceleration', 'stamina', 'agility', 'jumping', 'balance', 'strength'];
const MENTAL: AttrKey[] = ['positioning', 'vision', 'composure', 'decisions', 'anticipation', 'leadership', 'workRate'];
const GK_KEYS: AttrKey[] = ['reflexes', 'handling', 'kicking', 'aerialReach', 'oneOnOnes', 'command'];

function focusKeys(focus: string): AttrKey[] {
  switch (focus) {
    case 'attacking': return ['finishing', 'dribbling', 'crossing', 'technique', 'longShots', 'vision'];
    case 'defending': return ['tackling', 'marking', 'positioning', 'heading', 'anticipation', 'strength'];
    case 'physical': return PHYS;
    case 'technical': return ['passing', 'technique', 'dribbling', 'crossing', 'finishing'];
    case 'tactical': return MENTAL;
    case 'setpieces': return ['freeKicks', 'corners', 'penalties', 'heading'];
    default: return [];
  }
}

/** Monthly growth/decline tick */
export function developPlayer(state: GameState, p: Player, rng: RNG, months = 1) {
  const age = ageOn(p.born, p.bornDay, state.day, state.seasonYear);
  const club = p.clubId !== null ? state.clubs[p.clubId] : null;
  const apps = p.stats['ALL']?.apps ?? 0;
  const seasonProgress = clamp((state.day - (state.seasonYear - 2026) * 365) / 300, 0.1, 1);
  const playingTime = clamp(apps / (30 * seasonProgress), 0, 1.2);
  const gap = p.pot - p.ovr;
  let rate: number; // expected ovr change per month
  if (age <= 18) rate = 0.45; else if (age <= 21) rate = 0.38; else if (age <= 24) rate = 0.24; else if (age <= 27) rate = 0.08; else if (age <= 29) rate = 0.0; else if (age <= 31) rate = -0.07; else if (age <= 33) rate = -0.2; else rate = -0.4;
  if (rate > 0) rate *= clamp(gap / 8, 0.15, 1.6) * (0.6 + 0.5 * playingTime) * (club ? 0.8 + club.reputation / 250 : 0.7);
  if (rate < 0 && age < 33) rate *= 0.6 + 0.4 * (1 - playingTime);
  rate *= months;
  const focus = club ? focusKeys(club.training) : [];
  const w = POS_WEIGHTS[p.pos];
  // apply to attributes stochastically
  const keys = p.pos === 'GK' ? ATTR_KEYS.filter((k) => GK_KEYS.includes(k) || (w[k] ?? 0) > 0.3) : ATTR_KEYS.filter((k) => !GK_KEYS.includes(k));
  const nChanges = Math.max(1, Math.round(Math.abs(rate) * 6 + rng.float(0, 1.5)));
  for (let i = 0; i < nChanges; i++) {
    let k = rng.pick(keys);
    if (focus.length && rng.chance(0.4)) k = rng.pick(focus);
    if (rate < 0 && rng.chance(0.55)) k = rng.pick(PHYS); // decline hits physicals first
    if (rate > 0 && age >= 28 && rng.chance(0.4)) k = rng.pick(MENTAL);
    const dir = rate > 0 ? (rng.chance(0.92) ? 1 : -1) : rng.chance(0.85) ? -1 : 1;
    if (rate === 0 && !rng.chance(0.3)) continue;
    p.attrs[k] = clamp(p.attrs[k] + dir, 1, 20);
  }
  const newOvr = calcOverall(p.attrs, p.pos);
  if (newOvr > p.pot + 1 && age <= 27) p.pot = newOvr; // late bloomer
  p.ovr = newOvr;
  p.value = calcValue(p.ovr, age, p.pot, p.pos);
}

export function monthlyDevelopment(state: GameState) {
  const rng = new RNG(hashString(`${state.seed}-dev-${state.day}`));
  for (const p of Object.values(state.players)) if (p.clubId !== null) developPlayer(state, p, rng, 1);
}

export function endOfSeasonDevelopment(state: GameState) {
  const rng = new RNG(hashString(`${state.seed}-dev-eos-${state.seasonYear}`));
  for (const p of Object.values(state.players)) if (p.clubId !== null) developPlayer(state, p, rng, 1.5);
}

export function retirements(state: GameState) {
  const rng = new RNG(hashString(`${state.seed}-ret-${state.seasonYear}`));
  const retired: Player[] = [];
  for (const p of Object.values(state.players)) {
    const age = state.seasonYear + 1 - p.born;
    let pRet = 0;
    if (age >= 40) pRet = 1; else if (age >= 37) pRet = 0.6; else if (age >= 35) pRet = 0.35; else if (age >= 33) pRet = 0.1;
    if (p.ovr < 58 && age >= 31) pRet += 0.3;
    if (p.pos === 'GK') pRet *= 0.6;
    if (pRet > 0 && rng.chance(pRet)) retired.push(p);
  }
  for (const p of retired) {
    const club = p.clubId !== null ? state.clubs[p.clubId] : null;
    if (club) { club.players = club.players.filter((id) => id !== p.id); club.lineup.starters = club.lineup.starters.map((x) => (x === p.id ? null : x)); club.lineup.bench = club.lineup.bench.map((x) => (x === p.id ? null : x)); }
    state.freeAgents = state.freeAgents.filter((id) => id !== p.id);
    if (club?.id === state.manager.clubId || p.ovr >= 82) addNews(state, { category: 'general', title: `${p.name} retires`, body: `${p.name} (${state.seasonYear + 1 - p.born}) has announced his retirement from football${club ? ` after his spell at ${club.name}` : ''}.`, playerId: p.id });
    delete state.players[p.id];
  }
}

/** Contracts ending this summer: AI clubs renew or release; user's expiring players leave (unless renewed earlier). */
export function contractExpiry(state: GameState) {
  const rng = new RNG(hashString(`${state.seed}-exp-${state.seasonYear}`));
  const expiringYear = state.seasonYear + 1;
  for (const p of Object.values(state.players)) {
    if (p.clubId === null) continue;
    // loans end
    if (p.loanFrom !== null) {
      const to = state.clubs[p.clubId]; const from = state.clubs[p.loanFrom];
      if (to && from) { to.players = to.players.filter((id) => id !== p.id); from.players.push(p.id); p.clubId = from.id; p.loanFrom = null; }
      continue;
    }
    if (p.contractEnd > expiringYear) continue;
    const club = state.clubs[p.clubId];
    if (club.id !== state.manager.clubId) {
      const squad = club.players.map((id) => state.players[id]).filter(Boolean);
      const avg = squad.reduce((s, x) => s + x.ovr, 0) / Math.max(1, squad.length);
      const age = expiringYear - p.born;
      if (p.ovr >= avg - 5 && age <= 33 && rng.chance(0.75)) { const d = contractDemand(state, p); p.wage = d.wage; p.contractEnd = expiringYear + d.years; continue; }
    }
    // release
    club.players = club.players.filter((id) => id !== p.id);
    club.lineup.starters = club.lineup.starters.map((x) => (x === p.id ? null : x)); club.lineup.bench = club.lineup.bench.map((x) => (x === p.id ? null : x));
    p.clubId = null; state.freeAgents.push(p.id);
    if (club.id === state.manager.clubId) addNews(state, { category: 'contract', title: `${p.name} leaves on a free`, body: `${p.name}'s contract has expired and he has left ${club.name}.`, playerId: p.id, important: true });
  }
  // AI clubs sign free agents to fill squads
  const fas = state.freeAgents.map((id) => state.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  for (const c of Object.values(state.clubs)) {
    if (c.id === state.manager.clubId) continue;
    while (c.players.length < 21 && fas.length) {
      const p = fas.shift()!; if (!p) break;
      if (p.ovr < c.reputation * 0.55) { continue; }
      state.freeAgents = state.freeAgents.filter((id) => id !== p.id);
      p.clubId = c.id; c.players.push(p.id); p.wage = calcWage(p.ovr, expiringYear - p.born, c.reputation); p.contractEnd = expiringYear + 2;
    }
  }
}

/** Youth intake each summer */
export function youthIntake(state: GameState) {
  const rng = new RNG(hashString(`${state.seed}-youth-${state.seasonYear}`));
  for (const c of Object.values(state.clubs)) {
    const n = c.tier === 1 ? rng.int(2, 4) : rng.int(1, 2);
    const names: string[] = [];
    for (let i = 0; i < n; i++) {
      const pos = rng.pick(ALL_POS as Pos[]);
      const base = 38 + c.reputation * 0.22 + rng.normal(0, 4);
      const p = generatePlayer(state, rng, c.id, c.nation, c.reputation, pos, Math.round(base), state.day, [16, 18]);
      p.pot = clamp(Math.round(p.ovr + rng.int(12, 30) + (c.reputation > 80 ? 5 : 0)), p.ovr + 5, 94);
      p.contractEnd = state.seasonYear + 1 + 3; p.wage = Math.max(500, Math.round(p.wage * 0.4 / 50) * 50);
      p.number = 40 + rng.int(0, 59);
      state.players[p.id] = p; c.players.push(p.id);
      names.push(`${p.name} (${p.pos}, ${p.ovr}/${p.pot})`);
    }
    if (c.id === state.manager.clubId) addNews(state, { category: 'youth', title: 'Youth intake', body: `The academy has promoted ${n} players to the first-team squad: ${names.join(', ')}.`, important: true });
  }
}
