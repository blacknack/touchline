import { Club, GameState, Player, Pos, ALL_POS, emptyStats } from './types';
import { RNG, hashString, clamp } from './rng';
import { ClubDef, P } from './data/schema';
import { ENG } from './data/players/eng';
import { ESP } from './data/players/esp';
import { GER } from './data/players/ger';
import { ITA } from './data/players/ita';
import { FRA } from './data/players/fra';
import { EURO } from './data/players/euro';
import { EURO_EXTRA, ENG_LOWER, ESP_LOWER, GER_LOWER, ITA_LOWER, FRA_LOWER, X } from './data/clubs_extra';
import { poolFor, nationalityMix } from './data/names';
import { generateAttributes, calcOverall, calcValue, calcWage, dateToDay } from './attributes';
import { DEFAULT_TACTIC, emptyLineup, FORMATION_NAMES, bestFormation } from './tactics';

export const LEAGUE_IDS = ['ENG1', 'ESP1', 'GER1', 'ITA1', 'FRA1'] as const;
export const LEAGUE_NATION: Record<string, string> = { ENG1: 'ENG', ESP1: 'ESP', GER1: 'GER', ITA1: 'ITA', FRA1: 'FRA' };

function xToDef(x: X): ClubDef {
  const [name, short, nation, tier, rep, c1, c2, stadium, capacity] = x;
  const stadiumName = stadium ?? (nation === 'ESP' ? `Estadio de ${name}` : nation === 'ITA' ? `Stadio ${name}` : nation === 'FRA' ? `Stade de ${name}` : nation === 'GER' ? `${name}-Stadion` : `${name} Ground`);
  return {
    name, short, nation, league: tier === 1 ? `${nation}1` : `${nation}${tier}`, tier, rep, colors: [c1, c2], stadium: stadiumName,
    capacity: capacity ?? Math.round(6000 + rep * 300), wealth: tier === 1 ? (rep > 60 ? 3 : rep > 45 ? 2 : 1) : tier === 2 ? (rep > 55 ? 2 : 1) : 1, squad: [],
  };
}

const POS_TEMPLATE_22: Pos[] = ['GK', 'GK', 'GK', 'CB', 'CB', 'CB', 'CB', 'RB', 'RB', 'LB', 'LB', 'DM', 'DM', 'CM', 'CM', 'CM', 'AM', 'AM', 'RW', 'RW', 'LW', 'LW', 'ST', 'ST', 'ST'];

export function randomName(rng: RNG, nat: string): string {
  const pool = poolFor(nat);
  return `${rng.pick(pool.first)} ${rng.pick(pool.last)}`;
}

export function pickNationality(rng: RNG, clubNation: string): string {
  const mix = nationalityMix(clubNation);
  return rng.weighted(mix.map((m) => m[0]), mix.map((m) => m[1]));
}

let playerSeq = 1;
export function nextPlayerId(state?: GameState): number {
  if (state) return state.nextId.player++;
  return playerSeq++;
}

export function makePlayer(
  id: number, name: string, pos: Pos, altPos: Pos[], born: number, nat: string, ovr: number, pot: number,
  clubId: number | null, clubRep: number, day: number, rng: RNG, regen = false,
): Player {
  const age = 2026 - born;
  const attrs = generateAttributes(name, born, pos, ovr, age);
  const realOvr = calcOverall(attrs, pos);
  const potential = Math.max(realOvr, pot);
  const value = calcValue(realOvr, age, potential, pos);
  return {
    id, name, pos, altPos, born, bornDay: rng.int(1, 365), nat, attrs, ovr: realOvr, pot: potential, clubId,
    value, wage: calcWage(realOvr, age, clubRep),
    contractEnd: 2027 + rng.weighted([0, 1, 2, 3, 4], [12, 30, 28, 20, 10]),
    number: 0, morale: rng.int(60, 82), condition: 100, sharpness: rng.int(80, 100), injury: null, suspension: {}, yellowsInComp: {},
    form: [], stats: {}, career: [], regen, loanFrom: null, transferListed: false, joinedDay: day - rng.int(0, 1500), unhappy: 0,
    preferredFoot: pos === 'LB' || pos === 'LW' ? (rng.chance(0.7) ? 'L' : 'R') : rng.chance(0.25) ? 'L' : 'R',
    traits: [],
  };
}

function defaultPotential(ovr: number, age: number, rng: RNG): number {
  if (age >= 29) return ovr;
  const room = age <= 19 ? rng.int(8, 18) : age <= 22 ? rng.int(4, 12) : age <= 25 ? rng.int(1, 6) : rng.int(0, 3);
  return clamp(ovr + room, ovr, 96);
}

function parsePos(s: string): { pos: Pos; alt: Pos[] } {
  const parts = s.split('/').map((x) => x.trim()) as Pos[];
  const valid = parts.filter((p) => ALL_POS.includes(p));
  return { pos: valid[0] ?? 'CM', alt: valid.slice(1) };
}

/** Generate a filler player for a club at a given quality band. */
export function generatePlayer(state: GameState | null, rng: RNG, clubId: number | null, clubNation: string, clubRep: number, pos: Pos, ovr: number, day: number, ageRange: [number, number] = [18, 33]): Player {
  const nat = pickNationality(rng, clubNation);
  const name = randomName(rng, nat);
  const age = rng.int(ageRange[0], ageRange[1]);
  const born = 2026 - age;
  const id = state ? state.nextId.player++ : nextPlayerId();
  const p = makePlayer(id, name, pos, [], born, nat, clamp(ovr, 35, 92), defaultPotential(ovr, age, rng), clubId, clubRep, day, rng, true);
  return p;
}

/** Quality band for generated squads by reputation */
function bandForRep(rep: number): { mean: number; sd: number } {
  // rep 30 -> ~52, rep 50 -> ~62, rep 70 -> ~72
  return { mean: 37 + rep * 0.5, sd: 3 };
}

function assignNumbers(club: Club, players: Record<number, Player>, rng: RNG) {
  const taken = new Set<number>();
  const prefer: Record<Pos, number[]> = {
    GK: [1, 13, 25, 31], CB: [4, 5, 6, 3, 15, 24], LB: [3, 23, 17], RB: [2, 22, 12], DM: [6, 8, 16, 5], CM: [8, 6, 14, 18, 21], AM: [10, 8, 20, 19], LW: [11, 7, 17, 27], RW: [7, 11, 17, 21], ST: [9, 19, 29, 10],
  };
  const sorted = club.players.map((id) => players[id]).sort((a, b) => b.ovr - a.ovr);
  for (const p of sorted) {
    let n = prefer[p.pos].find((x) => !taken.has(x));
    if (n === undefined) { n = rng.int(12, 45); while (taken.has(n)) n++; }
    taken.add(n);
    p.number = n;
  }
}

export interface BuiltWorld { clubs: Record<number, Club>; players: Record<number, Player>; nextPlayerId: number; }

export function buildWorld(seed: number, day: number): BuiltWorld {
  const rng = new RNG(seed);
  const clubs: Record<number, Club> = {};
  const players: Record<number, Player> = {};
  let clubId = 1;
  playerSeq = 1;

  const defs: ClubDef[] = [
    ...ENG, ...ESP, ...GER, ...ITA, ...FRA, ...EURO,
    ...EURO_EXTRA.map(xToDef), ...ENG_LOWER.map(xToDef), ...ESP_LOWER.map(xToDef), ...GER_LOWER.map(xToDef), ...ITA_LOWER.map(xToDef), ...FRA_LOWER.map(xToDef),
  ];
  const shortSeen = new Map<string, number>();

  for (const d of defs) {
    const id = clubId++;
    let short = d.short;
    const key = `${d.nation}:${short}`;
    if (shortSeen.has(key)) short = short.slice(0, 2) + String(shortSeen.get(key)! + 1);
    shortSeen.set(key, (shortSeen.get(key) ?? 0) + 1);
    const wealthBalance = [0, 3e6, 12e6, 35e6, 80e6, 160e6, 320e6][d.wealth] ?? 10e6;
    const club: Club = {
      id, name: d.name, short, nick: d.nick, nation: d.nation, leagueId: d.league, tier: d.tier, reputation: d.rep, colors: d.colors,
      stadium: d.stadium, capacity: d.capacity, players: [], tactic: { ...DEFAULT_TACTIC, formation: rng.pick(['4-3-3', '4-2-3-1', '4-3-3', '3-5-2', '4-4-2', '4-2-3-1', '3-4-2-1', '4-1-4-1']) },
      lineup: emptyLineup(), balance: wealthBalance, transferBudget: Math.round(Math.min(wealthBalance * 0.6, 10e6 + Math.pow(Math.max(0, d.rep - 50), 2) * 0.09e6)), wageBudget: 0,
      managerName: '', boardConfidence: 70, fanHappiness: 65, expectation: d.expectation ?? 'midtable', honours: [], rivals: [],
      generatedSquad: d.squad.length === 0, coefficient: d.rep * 0.4, training: 'balanced',
    };
    if (!FORMATION_NAMES.includes(club.tactic.formation)) club.tactic.formation = '4-3-3';
    clubs[id] = club;

    const crng = new RNG(hashString(d.name) ^ seed);
    // Real players
    for (const raw of d.squad as P[]) {
      const [name, posStr, born, nat, ovr, potMaybe] = raw;
      const { pos, alt } = parsePos(posStr);
      const age = 2026 - born;
      const pot = potMaybe ?? defaultPotential(ovr, age, crng);
      const pid = playerSeq++;
      const p = makePlayer(pid, name, pos, alt, born, nat, ovr, pot, id, d.rep, day, crng, false);
      players[pid] = p;
      club.players.push(pid);
    }
    // Fill to a sensible squad size
    const target = d.tier === 1 && d.squad.length > 0 ? 24 : d.tier === 1 ? 22 : 18;
    const counts: Record<string, number> = {};
    for (const pid of club.players) counts[players[pid].pos] = (counts[players[pid].pos] ?? 0) + 1;
    const need: Pos[] = [];
    for (const pos of POS_TEMPLATE_22) {
      const have = counts[pos] ?? 0;
      const want = POS_TEMPLATE_22.filter((x) => x === pos).length;
      if (have < want) { need.push(pos); counts[pos] = have + 1; }
    }
    const band = bandForRep(d.rep);
    let idx = 0;
    while (club.players.length < target) {
      const pos = idx < need.length ? need[idx] : crng.pick(ALL_POS);
      idx++;
      // fillers on real squads are backups / youth: lower band
      const isRealSquad = d.squad.length > 0;
      const q = isRealSquad ? Math.round(band.mean - 6 + crng.normal(0, 3)) : Math.round(band.mean + crng.normal(0, band.sd));
      const ageRange: [number, number] = isRealSquad ? [17, 22] : [18, 34];
      const p = generatePlayer(null, crng, id, d.nation, d.rep, pos, q, day, ageRange);
      players[p.id] = p;
      club.players.push(p.id);
    }
    assignNumbers(club, players, crng);
  }

  // Rivals: resolve short codes within nation
  const byKey = new Map<string, number>();
  for (const c of Object.values(clubs)) byKey.set(`${c.nation}:${c.short}`, c.id);
  for (const d of defs) {
    const c = Object.values(clubs).find((x) => x.name === d.name)!;
    c.rivals = (d.rivals ?? []).map((s) => byKey.get(`${d.nation}:${s}`)).filter((x): x is number => x !== undefined);
  }
  // Best-fit formations
  for (const c of Object.values(clubs)) c.tactic.formation = bestFormation(c, players);
  // Wage budgets from actual wages + headroom
  for (const c of Object.values(clubs)) {
    const wages = c.players.reduce((s, id) => s + players[id].wage, 0);
    c.wageBudget = Math.round(wages * 1.12 / 1000) * 1000;
  }
  return { clubs, players, nextPlayerId: playerSeq };
}

export const SEASON_START_DAY = dateToDay(2026, 7, 1);
