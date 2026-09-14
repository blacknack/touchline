import { GameState, Player, Club, Pos } from '../engine/types';
import { ageOn, formatDay } from '../engine/attributes';
import { nationFlag } from '../engine/data/nations';
export { fmtMoney } from '../engine/finance';
export { formatDay };

export const age = (state: GameState, p: Player) => ageOn(p.born, p.bornDay, state.day, state.seasonYear);
export const flag = nationFlag;
export const surname = (name: string) => { const parts = name.split(' '); return parts.length > 1 ? parts.slice(1).join(' ') : name; };
export const shortName = (name: string) => { const parts = name.split(' '); if (parts.length <= 1) return name; return `${parts[0][0]}. ${parts.slice(1).join(' ')}`; };

export function ovrColor(v: number): string {
  if (v >= 88) return '#f5c518';
  if (v >= 82) return '#5ee39a';
  if (v >= 75) return '#8fd3ff';
  if (v >= 68) return '#c9d1d9';
  if (v >= 60) return '#9aa4ae';
  return '#6b7480';
}
export function attrColor(v: number): string {
  if (v >= 17) return '#f5c518';
  if (v >= 14) return '#5ee39a';
  if (v >= 11) return '#8fd3ff';
  if (v >= 8) return '#c9d1d9';
  return '#6b7480';
}
export function ratingColor(r: number): string {
  if (r >= 8.5) return '#f5c518';
  if (r >= 7.5) return '#5ee39a';
  if (r >= 6.8) return '#8fd3ff';
  if (r >= 6.0) return '#c9d1d9';
  return '#f0716b';
}
export function conditionColor(v: number): string {
  if (v >= 85) return '#5ee39a';
  if (v >= 70) return '#c9d940';
  if (v >= 55) return '#f0a640';
  return '#f0716b';
}
export function moraleLabel(v: number): string {
  if (v >= 85) return 'Superb'; if (v >= 70) return 'Good'; if (v >= 55) return 'Okay'; if (v >= 40) return 'Poor'; return 'Very poor';
}
export const POS_ORDER: Pos[] = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];
export const posColor = (pos: Pos) => pos === 'GK' ? '#e8b923' : ['CB', 'LB', 'RB'].includes(pos) ? '#4f9cf5' : ['DM', 'CM', 'AM'].includes(pos) ? '#5ee39a' : '#f0716b';

/** Pick a readable text color for a given background */
export function contrastText(bg: string): string {
  const c = bg.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111' : '#fff';
}
export function clubAccent(club: Club): string {
  // avoid pure white as accent
  const c = club.colors[0].toLowerCase();
  if (c === '#ffffff' || c === '#fff') return club.colors[1];
  return club.colors[0];
}
export const pct = (v: number) => `${Math.round(v)}%`;
export const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;
export function statAvg(p: Player, comp = 'ALL'): string { const s = p.stats[comp]; return s && s.apps ? (s.ratingSum / s.apps).toFixed(2) : '-'; }
export function contractLabel(p: Player): string { return `Jun ${p.contractEnd}`; }
export function ordinal(n: number): string { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
