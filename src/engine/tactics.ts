import { Club, Lineup, Player, Pos, Tactic } from './types';
import { ovrAtPosition } from './attributes';

export interface FormationSlot {
  pos: Pos;
  x: number; // 0..100 (left-right)
  y: number; // 0..100 (own goal 0 -> opponent goal 100)
  role: string;
}

export const FORMATIONS: Record<string, FormationSlot[]> = {
  '4-3-3': [
    { pos: 'GK', x: 50, y: 5, role: 'GK' },
    { pos: 'RB', x: 85, y: 25, role: 'FB' }, { pos: 'CB', x: 62, y: 20, role: 'CD' }, { pos: 'CB', x: 38, y: 20, role: 'CD' }, { pos: 'LB', x: 15, y: 25, role: 'FB' },
    { pos: 'DM', x: 50, y: 42, role: 'DM' }, { pos: 'CM', x: 68, y: 55, role: 'CM' }, { pos: 'CM', x: 32, y: 55, role: 'CM' },
    { pos: 'RW', x: 82, y: 78, role: 'W' }, { pos: 'ST', x: 50, y: 88, role: 'ST' }, { pos: 'LW', x: 18, y: 78, role: 'W' },
  ],
  '4-2-3-1': [
    { pos: 'GK', x: 50, y: 5, role: 'GK' },
    { pos: 'RB', x: 85, y: 25, role: 'FB' }, { pos: 'CB', x: 62, y: 20, role: 'CD' }, { pos: 'CB', x: 38, y: 20, role: 'CD' }, { pos: 'LB', x: 15, y: 25, role: 'FB' },
    { pos: 'DM', x: 62, y: 45, role: 'DM' }, { pos: 'DM', x: 38, y: 45, role: 'DM' },
    { pos: 'RW', x: 82, y: 70, role: 'W' }, { pos: 'AM', x: 50, y: 68, role: 'AM' }, { pos: 'LW', x: 18, y: 70, role: 'W' },
    { pos: 'ST', x: 50, y: 88, role: 'ST' },
  ],
  '4-4-2': [
    { pos: 'GK', x: 50, y: 5, role: 'GK' },
    { pos: 'RB', x: 85, y: 25, role: 'FB' }, { pos: 'CB', x: 62, y: 20, role: 'CD' }, { pos: 'CB', x: 38, y: 20, role: 'CD' }, { pos: 'LB', x: 15, y: 25, role: 'FB' },
    { pos: 'RW', x: 85, y: 55, role: 'WM' }, { pos: 'CM', x: 62, y: 50, role: 'CM' }, { pos: 'CM', x: 38, y: 50, role: 'CM' }, { pos: 'LW', x: 15, y: 55, role: 'WM' },
    { pos: 'ST', x: 60, y: 86, role: 'ST' }, { pos: 'ST', x: 40, y: 86, role: 'ST' },
  ],
  '4-4-1-1': [
    { pos: 'GK', x: 50, y: 5, role: 'GK' },
    { pos: 'RB', x: 85, y: 25, role: 'FB' }, { pos: 'CB', x: 62, y: 20, role: 'CD' }, { pos: 'CB', x: 38, y: 20, role: 'CD' }, { pos: 'LB', x: 15, y: 25, role: 'FB' },
    { pos: 'RW', x: 85, y: 55, role: 'WM' }, { pos: 'CM', x: 62, y: 50, role: 'CM' }, { pos: 'CM', x: 38, y: 50, role: 'CM' }, { pos: 'LW', x: 15, y: 55, role: 'WM' },
    { pos: 'AM', x: 50, y: 70, role: 'AM' }, { pos: 'ST', x: 50, y: 88, role: 'ST' },
  ],
  '4-1-4-1': [
    { pos: 'GK', x: 50, y: 5, role: 'GK' },
    { pos: 'RB', x: 85, y: 25, role: 'FB' }, { pos: 'CB', x: 62, y: 20, role: 'CD' }, { pos: 'CB', x: 38, y: 20, role: 'CD' }, { pos: 'LB', x: 15, y: 25, role: 'FB' },
    { pos: 'DM', x: 50, y: 40, role: 'DM' },
    { pos: 'RW', x: 85, y: 62, role: 'WM' }, { pos: 'CM', x: 62, y: 58, role: 'CM' }, { pos: 'CM', x: 38, y: 58, role: 'CM' }, { pos: 'LW', x: 15, y: 62, role: 'WM' },
    { pos: 'ST', x: 50, y: 88, role: 'ST' },
  ],
  '3-5-2': [
    { pos: 'GK', x: 50, y: 5, role: 'GK' },
    { pos: 'CB', x: 72, y: 20, role: 'CD' }, { pos: 'CB', x: 50, y: 17, role: 'CD' }, { pos: 'CB', x: 28, y: 20, role: 'CD' },
    { pos: 'RB', x: 90, y: 50, role: 'WB' }, { pos: 'CM', x: 64, y: 50, role: 'CM' }, { pos: 'DM', x: 50, y: 42, role: 'DM' }, { pos: 'CM', x: 36, y: 50, role: 'CM' }, { pos: 'LB', x: 10, y: 50, role: 'WB' },
    { pos: 'ST', x: 60, y: 86, role: 'ST' }, { pos: 'ST', x: 40, y: 86, role: 'ST' },
  ],
  '3-4-3': [
    { pos: 'GK', x: 50, y: 5, role: 'GK' },
    { pos: 'CB', x: 72, y: 20, role: 'CD' }, { pos: 'CB', x: 50, y: 17, role: 'CD' }, { pos: 'CB', x: 28, y: 20, role: 'CD' },
    { pos: 'RB', x: 90, y: 50, role: 'WB' }, { pos: 'CM', x: 62, y: 48, role: 'CM' }, { pos: 'CM', x: 38, y: 48, role: 'CM' }, { pos: 'LB', x: 10, y: 50, role: 'WB' },
    { pos: 'RW', x: 78, y: 78, role: 'W' }, { pos: 'ST', x: 50, y: 88, role: 'ST' }, { pos: 'LW', x: 22, y: 78, role: 'W' },
  ],
  '3-4-2-1': [
    { pos: 'GK', x: 50, y: 5, role: 'GK' },
    { pos: 'CB', x: 72, y: 20, role: 'CD' }, { pos: 'CB', x: 50, y: 17, role: 'CD' }, { pos: 'CB', x: 28, y: 20, role: 'CD' },
    { pos: 'RB', x: 90, y: 50, role: 'WB' }, { pos: 'CM', x: 62, y: 46, role: 'CM' }, { pos: 'CM', x: 38, y: 46, role: 'CM' }, { pos: 'LB', x: 10, y: 50, role: 'WB' },
    { pos: 'AM', x: 64, y: 70, role: 'AM' }, { pos: 'AM', x: 36, y: 70, role: 'AM' }, { pos: 'ST', x: 50, y: 88, role: 'ST' },
  ],
  '4-3-1-2': [
    { pos: 'GK', x: 50, y: 5, role: 'GK' },
    { pos: 'RB', x: 85, y: 25, role: 'FB' }, { pos: 'CB', x: 62, y: 20, role: 'CD' }, { pos: 'CB', x: 38, y: 20, role: 'CD' }, { pos: 'LB', x: 15, y: 25, role: 'FB' },
    { pos: 'DM', x: 50, y: 42, role: 'DM' }, { pos: 'CM', x: 68, y: 52, role: 'CM' }, { pos: 'CM', x: 32, y: 52, role: 'CM' },
    { pos: 'AM', x: 50, y: 68, role: 'AM' }, { pos: 'ST', x: 62, y: 86, role: 'ST' }, { pos: 'ST', x: 38, y: 86, role: 'ST' },
  ],
  '5-3-2': [
    { pos: 'GK', x: 50, y: 5, role: 'GK' },
    { pos: 'RB', x: 90, y: 32, role: 'WB' }, { pos: 'CB', x: 70, y: 20, role: 'CD' }, { pos: 'CB', x: 50, y: 17, role: 'CD' }, { pos: 'CB', x: 30, y: 20, role: 'CD' }, { pos: 'LB', x: 10, y: 32, role: 'WB' },
    { pos: 'CM', x: 66, y: 52, role: 'CM' }, { pos: 'DM', x: 50, y: 45, role: 'DM' }, { pos: 'CM', x: 34, y: 52, role: 'CM' },
    { pos: 'ST', x: 60, y: 86, role: 'ST' }, { pos: 'ST', x: 40, y: 86, role: 'ST' },
  ],
  '5-4-1': [
    { pos: 'GK', x: 50, y: 5, role: 'GK' },
    { pos: 'RB', x: 90, y: 32, role: 'WB' }, { pos: 'CB', x: 70, y: 20, role: 'CD' }, { pos: 'CB', x: 50, y: 17, role: 'CD' }, { pos: 'CB', x: 30, y: 20, role: 'CD' }, { pos: 'LB', x: 10, y: 32, role: 'WB' },
    { pos: 'RW', x: 82, y: 60, role: 'WM' }, { pos: 'CM', x: 62, y: 52, role: 'CM' }, { pos: 'CM', x: 38, y: 52, role: 'CM' }, { pos: 'LW', x: 18, y: 60, role: 'WM' },
    { pos: 'ST', x: 50, y: 88, role: 'ST' },
  ],
  '4-2-2-2': [
    { pos: 'GK', x: 50, y: 5, role: 'GK' },
    { pos: 'RB', x: 85, y: 25, role: 'FB' }, { pos: 'CB', x: 62, y: 20, role: 'CD' }, { pos: 'CB', x: 38, y: 20, role: 'CD' }, { pos: 'LB', x: 15, y: 25, role: 'FB' },
    { pos: 'DM', x: 62, y: 45, role: 'DM' }, { pos: 'DM', x: 38, y: 45, role: 'DM' },
    { pos: 'AM', x: 70, y: 68, role: 'AM' }, { pos: 'AM', x: 30, y: 68, role: 'AM' },
    { pos: 'ST', x: 60, y: 87, role: 'ST' }, { pos: 'ST', x: 40, y: 87, role: 'ST' },
  ],
};
export const FORMATION_NAMES = Object.keys(FORMATIONS);

export const DEFAULT_TACTIC: Tactic = {
  formation: '4-3-3', mentality: 'balanced', tempo: 'normal', width: 'normal', pressing: 'medium', line: 'normal', passing: 'mixed', counter: false, timeWasting: false,
};

export function emptyLineup(): Lineup {
  return { starters: Array(11).fill(null), bench: Array(9).fill(null), captain: null, penaltyTaker: null, freeKickTaker: null, cornerTaker: null };
}

/** Effective match-day ability for a player at a given slot position, including condition/morale/sharpness. */
export function matchAbility(p: Player, pos: Pos): number {
  const base = ovrAtPosition(p, pos);
  const cond = 0.85 + 0.15 * (p.condition / 100);
  const sharp = 0.92 + 0.08 * (p.sharpness / 100);
  const morale = 0.96 + 0.08 * (p.morale / 100);
  return base * cond * sharp * morale;
}
/** Ability at kick-off, before in-match fatigue (condition is modelled by the engine's fatigue) */
export function kickoffAbility(p: Player, pos: Pos): number {
  const base = ovrAtPosition(p, pos);
  const sharp = 0.92 + 0.08 * (p.sharpness / 100);
  const morale = 0.96 + 0.08 * (p.morale / 100);
  return base * sharp * morale;
}

export function isAvailable(p: Player, compId: string): boolean {
  if (p.injury) return false;
  if ((p.suspension[compId] ?? 0) > 0) return false;
  return true;
}

/** AI picks a lineup for a club: best available XI for its formation, sensible bench. */
export function pickLineup(club: Club, players: Record<number, Player>, compId: string, opts: { rotate?: number; formation?: string } = {}): Lineup {
  const formation = opts.formation ?? club.tactic.formation;
  const slots = FORMATIONS[formation] ?? FORMATIONS['4-3-3'];
  const squad = club.players.map((id) => players[id]).filter((p) => p && isAvailable(p, compId));
  const used = new Set<number>();
  const starters: (number | null)[] = Array(11).fill(null);
  const rotate = opts.rotate ?? 0; // 0..1 how much to prefer fresh players

  // Greedy: fill slots in order of scarcity (GK first, then each slot picks best remaining)
  const order = slots.map((s, i) => ({ s, i })).sort((a, b) => (a.s.pos === 'GK' ? -1 : b.s.pos === 'GK' ? 1 : 0));
  for (const { s, i } of order) {
    let best: Player | null = null;
    let bestScore = -1;
    for (const p of squad) {
      if (used.has(p.id)) continue;
      if (s.pos === 'GK' && p.pos !== 'GK') continue;
      if (s.pos !== 'GK' && p.pos === 'GK') continue;
      let score = matchAbility(p, s.pos);
      if (rotate > 0) score *= 1 - rotate * (1 - p.condition / 100) * 1.5;
      if (score > bestScore) { best = p; bestScore = score; }
    }
    if (best) { starters[i] = best.id; used.add(best.id); }
  }
  // Bench: 1 GK + best remaining by ovr with position diversity
  const bench: (number | null)[] = [];
  const gk = squad.filter((p) => !used.has(p.id) && p.pos === 'GK').sort((a, b) => b.ovr - a.ovr)[0];
  if (gk) { bench.push(gk.id); used.add(gk.id); }
  const rest = squad.filter((p) => !used.has(p.id) && p.pos !== 'GK').sort((a, b) => b.ovr - a.ovr);
  for (const p of rest) { if (bench.length >= 9) break; bench.push(p.id); used.add(p.id); }
  while (bench.length < 9) bench.push(null);

  const xi = starters.filter((x): x is number => x !== null).map((id) => players[id]);
  const captain = xi.length ? xi.slice().sort((a, b) => (b.attrs.leadership * 2 + (2026 - b.born)) - (a.attrs.leadership * 2 + (2026 - a.born)))[0].id : null;
  const pen = xi.length ? xi.slice().sort((a, b) => b.attrs.penalties + b.attrs.composure - a.attrs.penalties - a.attrs.composure)[0].id : null;
  const fk = xi.length ? xi.slice().sort((a, b) => b.attrs.freeKicks - a.attrs.freeKicks)[0].id : null;
  const ck = xi.length ? xi.slice().sort((a, b) => b.attrs.corners + b.attrs.crossing - a.attrs.corners - a.attrs.crossing)[0].id : null;
  return { starters, bench, captain, penaltyTaker: pen, freeKickTaker: fk, cornerTaker: ck };
}

/** Validate/repair a user lineup: fill nulls / unavailable players with AI picks. */
export function repairLineup(club: Club, players: Record<number, Player>, compId: string): Lineup {
  const slots = FORMATIONS[club.tactic.formation] ?? FORMATIONS['4-3-3'];
  const lu = club.lineup;
  const starters = lu.starters.slice(0, 11);
  while (starters.length < 11) starters.push(null);
  const bench = lu.bench.slice(0, 9);
  while (bench.length < 9) bench.push(null);
  const inSquad = new Set(club.players);
  const used = new Set<number>();
  const ok = (id: number | null) => id !== null && inSquad.has(id) && players[id] && isAvailable(players[id], compId) && !used.has(id);
  for (let i = 0; i < 11; i++) { if (ok(starters[i])) used.add(starters[i]!); else starters[i] = null; }
  for (let i = 0; i < 9; i++) { if (ok(bench[i])) used.add(bench[i]!); else bench[i] = null; }
  const avail = club.players.map((id) => players[id]).filter((p) => p && isAvailable(p, compId) && !used.has(p.id));
  for (let i = 0; i < 11; i++) {
    if (starters[i] !== null) continue;
    const s = slots[i];
    let best: Player | null = null, bs = -1;
    for (const p of avail) {
      if (used.has(p.id)) continue;
      if ((s.pos === 'GK') !== (p.pos === 'GK')) continue;
      const sc = matchAbility(p, s.pos);
      if (sc > bs) { bs = sc; best = p; }
    }
    if (best) { starters[i] = best.id; used.add(best.id); }
  }
  for (let i = 0; i < 9; i++) {
    if (bench[i] !== null) continue;
    const needGk = i === 0 && !bench.some((id) => id !== null && players[id]?.pos === 'GK');
    const cands = avail.filter((p) => !used.has(p.id) && (needGk ? p.pos === 'GK' : true)).sort((a, b) => b.ovr - a.ovr);
    if (cands.length) { bench[i] = cands[0].id; used.add(cands[0].id); }
  }
  const xi = starters.filter((x): x is number => x !== null).map((id) => players[id]);
  const pickBest = (key: (p: Player) => number) => (xi.length ? xi.slice().sort((a, b) => key(b) - key(a))[0].id : null);
  return {
    starters, bench,
    captain: lu.captain !== null && starters.includes(lu.captain) ? lu.captain : pickBest((p) => p.attrs.leadership),
    penaltyTaker: lu.penaltyTaker !== null && starters.includes(lu.penaltyTaker) ? lu.penaltyTaker : pickBest((p) => p.attrs.penalties + p.attrs.composure),
    freeKickTaker: lu.freeKickTaker !== null && starters.includes(lu.freeKickTaker) ? lu.freeKickTaker : pickBest((p) => p.attrs.freeKicks),
    cornerTaker: lu.cornerTaker !== null && starters.includes(lu.cornerTaker) ? lu.cornerTaker : pickBest((p) => p.attrs.corners + p.attrs.crossing),
  };
}

/** AI chooses a tactic based on squad & opponent strength */
export function aiTactic(club: Club, players: Record<number, Player>, strengthDiff: number, rng: () => number): Tactic {
  const t: Tactic = { ...club.tactic };
  if (strengthDiff > 8) t.mentality = rng() < 0.5 ? 'attacking' : 'balanced';
  else if (strengthDiff < -8) t.mentality = rng() < 0.6 ? 'defensive' : 'balanced';
  else t.mentality = 'balanced';
  if (strengthDiff < -12) { t.counter = true; t.line = 'deep'; t.pressing = 'low'; }
  else if (strengthDiff > 10) { t.pressing = 'high'; t.line = 'high'; t.counter = false; }
  else { t.pressing = 'medium'; t.line = 'normal'; t.counter = rng() < 0.3; }
  void players;
  return t;
}

/** Squad strength = mean matchAbility of the best XI (formation-aware) */
export function squadStrength(club: Club, players: Record<number, Player>, compId = 'ALL'): number {
  const lu = pickLineup(club, players, compId);
  const slots = FORMATIONS[club.tactic.formation] ?? FORMATIONS['4-3-3'];
  let sum = 0, n = 0;
  lu.starters.forEach((id, i) => { if (id !== null && players[id]) { sum += ovrAtPosition(players[id], slots[i].pos); n++; } });
  return n ? sum / n : 40;
}

/** Choose the formation that gets the most out of the squad. */
export function bestFormation(club: Club, players: Record<number, Player>, compId = 'ALL'): string {
  let best = club.tactic.formation, bestV = -1;
  for (const f of FORMATION_NAMES) {
    const lu = pickLineup(club, players, compId, { formation: f });
    const slots = FORMATIONS[f];
    let sum = 0, n = 0;
    lu.starters.forEach((id, i) => { if (id !== null && players[id]) { sum += ovrAtPosition(players[id], slots[i].pos); n++; } });
    const v = n ? sum / n : 0;
    if (v > bestV + 0.15) { bestV = v; best = f; }
  }
  return best;
}
