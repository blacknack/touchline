// Swiss-model league phase template generator (UEFA 2024+ format).
// Produces a schedule structure over abstract slots: slot s belongs to pot floor(s/potSize).
// Each slot plays `perPot` opponents from every pot (incl. own), half home / half away where possible,
// and every slot plays exactly once per matchday.
import { RNG } from './rng';

export interface SwissTemplate {
  nPots: number; potSize: number; matchdays: number;
  games: { home: number; away: number; md: number }[]; // slots
}

function tryBuild(rng: RNG, nPots: number, potSize: number, perPot: number): SwissTemplate | null {
  const n = nPots * potSize;
  const pot = (s: number) => Math.floor(s / potSize);
  const edges: { a: number; b: number }[] = [];
  const deg: number[][] = Array.from({ length: n }, () => Array(nPots).fill(0));
  // Build pairings pot by pot
  for (let i = 0; i < nPots; i++) {
    for (let j = i; j < nPots; j++) {
      const A = rng.shuffle(Array.from({ length: potSize }, (_, k) => i * potSize + k));
      const B = rng.shuffle(Array.from({ length: potSize }, (_, k) => j * potSize + k));
      if (i !== j) {
        // perPot-regular bipartite: cyclic shifts
        for (let shift = 0; shift < perPot; shift++) for (let k = 0; k < potSize; k++) edges.push({ a: A[k], b: B[(k + shift) % potSize] });
      } else {
        if (perPot === 2) { for (let k = 0; k < potSize; k++) edges.push({ a: A[k], b: A[(k + 1) % potSize] }); }
        else if (perPot === 1) { if (potSize % 2) return null; for (let k = 0; k < potSize; k += 2) edges.push({ a: A[k], b: A[k + 1] }); }
        else return null;
      }
    }
  }
  for (const e of edges) { deg[e.a][pot(e.b)]++; deg[e.b][pot(e.a)]++; }
  const matchdays = nPots * perPot;
  // Edge colouring with Kempe-chain heuristic
  const color = new Array(edges.length).fill(-1);
  const at: Map<number, number>[] = Array.from({ length: n }, () => new Map()); // vertex -> color -> edge idx
  const freeColor = (v: number, exclude = -1) => { for (let c = 0; c < matchdays; c++) if (c !== exclude && !at[v].has(c)) return c; return -1; };
  const order = rng.shuffle(edges.map((_, i) => i));
  for (const ei of order) {
    const { a, b } = edges[ei];
    let ca = freeColor(a), cb = freeColor(b);
    if (ca < 0 || cb < 0) return null;
    if (!at[b].has(ca)) { color[ei] = ca; at[a].set(ca, ei); at[b].set(ca, ei); continue; }
    if (!at[a].has(cb)) { color[ei] = cb; at[a].set(cb, ei); at[b].set(cb, ei); continue; }
    // Kempe chain from b alternating cb/ca ... we want to free ca at b: swap ca<->cb along the path starting at b with color ca
    const path: number[] = []; let v = b; let c = ca; const seenE = new Set<number>();
    let endsAtA = false;
    while (at[v].has(c)) {
      const e = at[v].get(c)!; if (seenE.has(e)) break; seenE.add(e); path.push(e);
      const w = edges[e].a === v ? edges[e].b : edges[e].a;
      if (w === a) { endsAtA = true; break; }
      v = w; c = c === ca ? cb : ca;
    }
    if (endsAtA) return null; // give up this attempt (rare)
    for (const e of path) {
      const { a: x, b: y } = edges[e]; const old = color[e]; const nw = old === ca ? cb : ca;
      at[x].delete(old); at[y].delete(old); color[e] = nw;
    }
    for (const e of path) { const { a: x, b: y } = edges[e]; at[x].set(color[e], e); at[y].set(color[e], e); }
    if (at[b].has(ca) || at[a].has(ca)) return null;
    color[ei] = ca; at[a].set(ca, ei); at[b].set(ca, ei);
  }
  // Home/away balance: orient edges so each vertex has ~half home per pot (perPot=2 -> 1H 1A; perPot=1 -> alternate)
  const homeCount = Array(n).fill(0);
  const games = edges.map((e, i) => ({ home: e.a, away: e.b, md: color[i] }));
  // Greedy orientation: for perPot=2 ensure per pot 1H/1A
  if (perPot === 2) {
    const perPotHome: Map<string, number> = new Map();
    for (const g of games) {
      const key = (v: number, p: number) => `${v}:${p}`;
      const ha = perPotHome.get(key(g.home, pot(g.away))) ?? 0;
      const hb = perPotHome.get(key(g.away, pot(g.home))) ?? 0;
      if (ha >= 1 && hb < 1) { const t = g.home; g.home = g.away; g.away = t; }
      perPotHome.set(key(g.home, pot(g.away)), (perPotHome.get(key(g.home, pot(g.away))) ?? 0) + 1);
    }
  } else {
    for (const g of games) { if (homeCount[g.home] > homeCount[g.away]) { const t = g.home; g.home = g.away; g.away = t; } homeCount[g.home]++; }
    for (let pass = 0; pass < 50; pass++) {
      let changed = false;
      for (const g of games) {
        if (homeCount[g.home] - homeCount[g.away] >= 2) { homeCount[g.home]--; homeCount[g.away]++; const t = g.home; g.home = g.away; g.away = t; changed = true; }
      }
      if (!changed) break;
    }
  }
  // sanity: per matchday each vertex once
  for (let md = 0; md < matchdays; md++) { const seen = new Set<number>(); for (const g of games) if (g.md === md) { if (seen.has(g.home) || seen.has(g.away)) return null; seen.add(g.home); seen.add(g.away); } }
  return { nPots, potSize, matchdays, games };
}

const cache = new Map<string, SwissTemplate>();
export function swissTemplate(nPots: number, potSize: number, perPot: number, seed = 1234): SwissTemplate {
  const key = `${nPots}-${potSize}-${perPot}`;
  if (cache.has(key)) return cache.get(key)!;
  const rng = new RNG(seed);
  for (let attempt = 0; attempt < 5000; attempt++) {
    const t = tryBuild(rng, nPots, potSize, perPot);
    if (t) { cache.set(key, t); return t; }
  }
  throw new Error('Could not build swiss template ' + key);
}
