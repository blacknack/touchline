import { Attributes, AttrKey, Pos, Player } from './types';
import { RNG, clamp, hashString } from './rng';

export const ATTR_KEYS: AttrKey[] = [
  'finishing', 'passing', 'dribbling', 'crossing', 'tackling', 'heading', 'technique', 'longShots', 'marking',
  'freeKicks', 'penalties', 'corners',
  'positioning', 'vision', 'composure', 'workRate', 'aggression', 'anticipation', 'decisions', 'leadership', 'flair',
  'pace', 'acceleration', 'stamina', 'strength', 'agility', 'jumping', 'balance',
  'reflexes', 'handling', 'kicking', 'aerialReach', 'oneOnOnes', 'command',
];

export const ATTR_LABEL: Record<AttrKey, string> = {
  finishing: 'Finishing', passing: 'Passing', dribbling: 'Dribbling', crossing: 'Crossing', tackling: 'Tackling',
  heading: 'Heading', technique: 'Technique', longShots: 'Long Shots', marking: 'Marking', freeKicks: 'Free Kicks',
  penalties: 'Penalties', corners: 'Corners', positioning: 'Positioning', vision: 'Vision', composure: 'Composure',
  workRate: 'Work Rate', aggression: 'Aggression', anticipation: 'Anticipation', decisions: 'Decisions',
  leadership: 'Leadership', flair: 'Flair', pace: 'Pace', acceleration: 'Acceleration', stamina: 'Stamina',
  strength: 'Strength', agility: 'Agility', jumping: 'Jumping', balance: 'Balance', reflexes: 'Reflexes',
  handling: 'Handling', kicking: 'Kicking', aerialReach: 'Aerial Reach', oneOnOnes: 'One on Ones', command: 'Command of Area',
};

export const ATTR_GROUPS: { name: string; keys: AttrKey[] }[] = [
  { name: 'Technical', keys: ['finishing', 'passing', 'dribbling', 'crossing', 'tackling', 'heading', 'technique', 'longShots', 'marking', 'freeKicks', 'penalties', 'corners'] },
  { name: 'Mental', keys: ['positioning', 'vision', 'composure', 'workRate', 'aggression', 'anticipation', 'decisions', 'leadership', 'flair'] },
  { name: 'Physical', keys: ['pace', 'acceleration', 'stamina', 'strength', 'agility', 'jumping', 'balance'] },
  { name: 'Goalkeeping', keys: ['reflexes', 'handling', 'kicking', 'aerialReach', 'oneOnOnes', 'command'] },
];

// Importance (0..1) of each attribute per position. Used for both generation and overall rating.
type Weights = Partial<Record<AttrKey, number>>;
const base: Weights = {
  positioning: 0.4, vision: 0.3, composure: 0.4, workRate: 0.4, aggression: 0.3, anticipation: 0.4, decisions: 0.5,
  leadership: 0.2, flair: 0.2, pace: 0.4, acceleration: 0.4, stamina: 0.5, strength: 0.4, agility: 0.4, jumping: 0.3, balance: 0.4,
  passing: 0.4, technique: 0.4, dribbling: 0.3, finishing: 0.15, crossing: 0.2, tackling: 0.2, heading: 0.25, longShots: 0.2, marking: 0.2,
  freeKicks: 0.1, penalties: 0.15, corners: 0.1,
  reflexes: 0.0, handling: 0.0, kicking: 0.0, aerialReach: 0.0, oneOnOnes: 0.0, command: 0.0,
};

export const POS_WEIGHTS: Record<Pos, Weights> = {
  GK: {
    reflexes: 1, handling: 1, kicking: 0.6, aerialReach: 0.85, oneOnOnes: 0.9, command: 0.8, positioning: 0.9, composure: 0.6,
    decisions: 0.7, anticipation: 0.7, agility: 0.8, jumping: 0.6, strength: 0.4, passing: 0.4, technique: 0.2,
    pace: 0.1, acceleration: 0.15, stamina: 0.2, finishing: 0.02, dribbling: 0.05, crossing: 0.02, tackling: 0.05, heading: 0.1,
    longShots: 0.02, marking: 0.05, vision: 0.3, workRate: 0.2, aggression: 0.2, leadership: 0.4, flair: 0.05, balance: 0.4,
    freeKicks: 0.02, penalties: 0.05, corners: 0.02,
  },
  CB: { ...base, marking: 1, tackling: 1, heading: 0.95, positioning: 1, strength: 0.9, jumping: 0.9, anticipation: 0.85, composure: 0.6, passing: 0.55, pace: 0.6, acceleration: 0.5, aggression: 0.6, decisions: 0.7, leadership: 0.4, dribbling: 0.2, finishing: 0.05, crossing: 0.1, flair: 0.05 },
  LB: { ...base, tackling: 0.85, marking: 0.8, crossing: 0.8, pace: 0.85, acceleration: 0.8, stamina: 0.9, positioning: 0.8, dribbling: 0.6, passing: 0.65, workRate: 0.8, anticipation: 0.6, heading: 0.4, strength: 0.5, finishing: 0.1 },
  RB: { ...base, tackling: 0.85, marking: 0.8, crossing: 0.8, pace: 0.85, acceleration: 0.8, stamina: 0.9, positioning: 0.8, dribbling: 0.6, passing: 0.65, workRate: 0.8, anticipation: 0.6, heading: 0.4, strength: 0.5, finishing: 0.1 },
  DM: { ...base, tackling: 0.9, marking: 0.75, positioning: 0.9, passing: 0.85, anticipation: 0.85, workRate: 0.85, stamina: 0.85, strength: 0.7, decisions: 0.8, composure: 0.7, vision: 0.6, heading: 0.5, aggression: 0.6, technique: 0.6, dribbling: 0.4, longShots: 0.4, finishing: 0.15 },
  CM: { ...base, passing: 0.95, vision: 0.8, technique: 0.8, stamina: 0.9, workRate: 0.8, decisions: 0.85, tackling: 0.6, positioning: 0.7, dribbling: 0.6, longShots: 0.55, composure: 0.7, anticipation: 0.7, finishing: 0.35, marking: 0.4 },
  AM: { ...base, technique: 0.95, vision: 0.95, passing: 0.9, dribbling: 0.85, flair: 0.8, composure: 0.8, finishing: 0.6, longShots: 0.6, decisions: 0.8, agility: 0.7, balance: 0.7, acceleration: 0.65, tackling: 0.2, marking: 0.15, freeKicks: 0.4 },
  LW: { ...base, dribbling: 1, pace: 0.95, acceleration: 0.95, crossing: 0.7, finishing: 0.7, technique: 0.8, flair: 0.75, agility: 0.8, balance: 0.75, passing: 0.6, vision: 0.6, composure: 0.6, tackling: 0.15, marking: 0.1, workRate: 0.55 },
  RW: { ...base, dribbling: 1, pace: 0.95, acceleration: 0.95, crossing: 0.7, finishing: 0.7, technique: 0.8, flair: 0.75, agility: 0.8, balance: 0.75, passing: 0.6, vision: 0.6, composure: 0.6, tackling: 0.15, marking: 0.1, workRate: 0.55 },
  ST: { ...base, finishing: 1, composure: 0.9, positioning: 0.85, heading: 0.7, strength: 0.65, pace: 0.7, acceleration: 0.75, anticipation: 0.8, dribbling: 0.6, technique: 0.7, longShots: 0.5, jumping: 0.55, balance: 0.6, penalties: 0.4, tackling: 0.05, marking: 0.05, passing: 0.45, vision: 0.45 },
};

const GK_KEYS: AttrKey[] = ['reflexes', 'handling', 'kicking', 'aerialReach', 'oneOnOnes', 'command'];

/** Overall rating (1-99) for a given position from attributes. */
export function calcOverall(attrs: Attributes, pos: Pos): number {
  const w = POS_WEIGHTS[pos];
  let sum = 0, wsum = 0;
  for (const k of ATTR_KEYS) {
    const wt = w[k] ?? 0;
    if (wt <= 0.05) continue;
    // emphasise the most important attributes (square weighting)
    const ww = wt * wt;
    sum += attrs[k] * ww;
    wsum += ww;
  }
  const avg = sum / wsum; // 1..20
  // map 1..20 -> ~30..99 with slight curve
  const ovr = 8 + avg * 4.55;
  return clamp(Math.round(ovr), 20, 99);
}

/** Best overall across all positions */
export function bestPosition(attrs: Attributes, main: Pos, alts: Pos[]): { pos: Pos; ovr: number } {
  let best = { pos: main, ovr: calcOverall(attrs, main) };
  for (const p of alts) {
    const o = calcOverall(attrs, p);
    if (o > best.ovr) best = { pos: p, ovr: o };
  }
  return best;
}

/** Overall when playing out of position */
export function ovrAtPosition(p: Player, pos: Pos): number {
  if (pos === p.pos) return p.ovr;
  const o = calcOverall(p.attrs, pos);
  if (p.altPos.includes(pos)) return Math.round(o * 0.98);
  // related positions penalty
  const related: Record<Pos, Pos[]> = {
    GK: [], CB: ['DM', 'LB', 'RB'], LB: ['LW', 'CB', 'RB'], RB: ['RW', 'CB', 'LB'], DM: ['CM', 'CB'], CM: ['DM', 'AM'],
    AM: ['CM', 'LW', 'RW', 'ST'], LW: ['RW', 'AM', 'LB', 'ST'], RW: ['LW', 'AM', 'RB', 'ST'], ST: ['AM', 'LW', 'RW'],
  };
  if (pos === 'GK' || p.pos === 'GK') return Math.round(o * 0.45);
  if (related[p.pos].includes(pos)) return Math.round(o * 0.92);
  return Math.round(o * 0.85);
}

const ageFactor = (age: number, key: AttrKey): number => {
  const physical: AttrKey[] = ['pace', 'acceleration', 'stamina', 'agility', 'jumping', 'balance'];
  const mental: AttrKey[] = ['positioning', 'vision', 'composure', 'decisions', 'anticipation', 'leadership'];
  if (physical.includes(key)) {
    if (age <= 27) return 1.05;
    if (age <= 30) return 1.0;
    if (age <= 33) return 0.92;
    return 0.84;
  }
  if (mental.includes(key)) {
    if (age <= 21) return 0.9;
    if (age <= 25) return 0.97;
    if (age <= 33) return 1.05;
    return 1.03;
  }
  return 1;
};

/**
 * Generate a full attribute set for a player from a target overall and position.
 * Deterministic per (name, born) seed.
 */
export function generateAttributes(name: string, born: number, pos: Pos, targetOvr: number, age: number, seedSalt = 0): Attributes {
  const rng = new RNG(hashString(name + '|' + born + '|' + pos) + seedSalt);
  const w = POS_WEIGHTS[pos];
  const attrs = {} as Attributes;
  const scaled = targetOvr / 5; // 99 -> 19.8
  for (const k of ATTR_KEYS) {
    const imp = w[k] ?? 0;
    let v: number;
    if (pos !== 'GK' && GK_KEYS.includes(k)) {
      v = rng.int(1, 6);
    } else if (pos === 'GK' && !GK_KEYS.includes(k) && imp < 0.3) {
      v = clamp(Math.round(scaled * (0.15 + 0.5 * imp) + rng.normal(0, 1.5)), 1, 20);
    } else {
      const mean = scaled * (0.52 + 0.53 * imp) * ageFactor(age, k);
      v = clamp(Math.round(mean + rng.normal(0, 1.4)), 1, 20);
    }
    attrs[k] = v;
  }
  // Iteratively fit to target overall
  for (let iter = 0; iter < 6; iter++) {
    const cur = calcOverall(attrs, pos);
    const diff = targetOvr - cur;
    if (Math.abs(diff) < 1) break;
    const step = diff / 4.55;
    for (const k of ATTR_KEYS) {
      const imp = w[k] ?? 0;
      if (imp < 0.3) continue;
      attrs[k] = clamp(Math.round(attrs[k] + step * (0.6 + imp * 0.6) + rng.normal(0, 0.3)), 1, 20);
    }
  }
  // Feet & flavour: a few standout attributes
  const standoutN = rng.int(1, 3);
  const important = ATTR_KEYS.filter((k) => (w[k] ?? 0) >= 0.6);
  for (let i = 0; i < standoutN; i++) {
    const k = rng.pick(important);
    attrs[k] = clamp(attrs[k] + rng.int(1, 2), 1, 20);
  }
  return attrs;
}

/** Market value in € from overall, age and potential */
export function calcValue(ovr: number, age: number, pot: number, pos: Pos): number {
  // 60 -> ~0.45M, 70 -> 3M, 75 -> 8M, 80 -> 20M, 85 -> 50M, 90 -> 130M, 93 -> 230M
  let v = 3e6 * Math.exp((ovr - 70) * 0.19);
  let af = 1;
  if (age <= 20) af = 1.3;
  else if (age <= 23) af = 1.2;
  else if (age <= 27) af = 1.05;
  else if (age <= 29) af = 0.9;
  else if (age <= 31) af = 0.65;
  else if (age <= 33) af = 0.38;
  else af = 0.18;
  v *= af;
  if (age <= 24 && pot > ovr) v *= 1 + Math.min(0.9, (pot - ovr) * 0.05);
  if (pos === 'GK') v *= 0.75;
  if (pos === 'ST' || pos === 'LW' || pos === 'RW' || pos === 'AM') v *= 1.12;
  return Math.max(50000, Math.round(v / 50000) * 50000);
}

/** Weekly wage in € */
export function calcWage(ovr: number, age: number, clubReputation: number): number {
  // 70 -> ~30K, 80 -> ~130K, 85 -> ~270K, 90 -> ~560K per week (before club factor)
  let w = 30000 * Math.exp((ovr - 70) * 0.146);
  w *= 0.5 + clubReputation / 140;
  if (age <= 20) w *= 0.45;
  else if (age <= 23) w *= 0.7;
  else if (age >= 33) w *= 0.8;
  return Math.max(500, Math.round(w / 250) * 250);
}

export function ageOn(born: number, bornDay: number, day: number, seasonBaseYear: number): number {
  // day = days since 1 July seasonBaseYear-ish; approximate the calendar date
  const date = dayToDate(day);
  let age = date.getUTCFullYear() - born;
  const doy = Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000) + 1;
  if (doy < bornDay) age -= 1;
  void seasonBaseYear;
  return age;
}

export const EPOCH = Date.UTC(2026, 6, 1); // 1 July 2026 = day 0
export function dayToDate(day: number): Date {
  return new Date(EPOCH + day * 86400000);
}
export function dateToDay(y: number, m: number, d: number): number {
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
}
export function formatDay(day: number, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const d = dayToDate(day);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const core = `${d.getUTCDate()} ${months[d.getUTCMonth()]}${opts.year !== false ? ' ' + d.getUTCFullYear() : ''}`;
  return opts.weekday ? `${wd} ${core}` : core;
}
export function dayOfWeek(day: number): number {
  return dayToDate(day).getUTCDay();
}
export function seasonLabel(year: number): string {
  return `${year}/${String(year + 1).slice(2)}`;
}
