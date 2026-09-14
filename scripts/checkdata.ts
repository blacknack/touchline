import { ENG } from '../src/engine/data/players/eng';
import { ESP } from '../src/engine/data/players/esp';
import { GER } from '../src/engine/data/players/ger';
import { ITA } from '../src/engine/data/players/ita';
import { FRA } from '../src/engine/data/players/fra';
import { NATIONS } from '../src/engine/data/nations';
const all = [...ENG, ...ESP, ...GER, ...ITA, ...FRA];
const seen = new Map<string, string[]>();
let total = 0;
for (const c of all) {
  const counts: Record<string, number> = {};
  for (const p of c.squad) {
    total++;
    const k = p[0];
    seen.set(k, [...(seen.get(k) ?? []), c.short]);
    counts[p[1].split('/')[0]] = (counts[p[1].split('/')[0]] ?? 0) + 1;
    if (!NATIONS[p[3]]) console.log('Unknown nation', p[3], p[0], c.short);
    if (p[5] !== undefined && p[5] < p[4]) console.log('pot<ovr', p[0], c.short);
  }
  const gk = counts['GK'] ?? 0;
  if (gk < 2) console.log('Few GKs', c.short, gk);
  if (c.squad.length < 20) console.log('Small squad', c.short, c.squad.length);
  const shorts = all.filter(x => x.short === c.short);
  if (shorts.length > 1) console.log('Dup short', c.short);
}
for (const [k, v] of seen) if (v.length > 1) console.log('DUP', k, v.join(','));
console.log('clubs', all.length, 'players', total);
import { EURO } from '../src/engine/data/players/euro';
{
  const names = new Map<string, string[]>();
  for (const c of [...all, ...EURO]) for (const p of c.squad) names.set(p[0], [...(names.get(p[0]) ?? []), c.short]);
  for (const [k, v] of names) if (v.length > 1 && v.some(s => EURO.some(e => e.short === s))) console.log('EDUP', k, v.join(','));
  for (const c of EURO) { if (c.squad.filter(p => p[1].startsWith('GK')).length < 2) console.log('EURO few GK', c.short); if (c.squad.length < 15) console.log('EURO small', c.short, c.squad.length); for (const p of c.squad) if (!NATIONS[p[3]]) console.log('EURO nation', p[3], p[0]); }
  console.log('euro clubs', EURO.length);
}
