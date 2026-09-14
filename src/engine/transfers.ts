import { Club, GameState, Player, Pos, TransferOffer, ALL_POS } from './types';
import { RNG, hashString, clamp } from './rng';
import { calcValue, calcWage, ageOn, seasonLabel } from './attributes';
import { addNews } from './season';

export const ageOf = (state: GameState, p: Player) => ageOn(p.born, p.bornDay, state.day, state.seasonYear);

/** What the owning club wants for a player (€) */
export function askingPrice(state: GameState, p: Player): number {
  if (p.clubId === null) return 0;
  const club = state.clubs[p.clubId];
  const age = ageOf(state, p);
  const squad = club.players.map((id) => state.players[id]).filter(Boolean);
  const rankIdx = squad.slice().sort((a, b) => b.ovr - a.ovr).findIndex((x) => x.id === p.id);
  let mult = 1.25;
  if (rankIdx < 3) mult = 1.9; else if (rankIdx < 8) mult = 1.55; else if (rankIdx < 14) mult = 1.3;
  if (p.transferListed) mult = 0.85;
  if (p.contractEnd <= state.seasonYear + 1) mult *= 0.55; // last year of contract
  if (age >= 32) mult *= 0.8;
  if (club.reputation >= 88) mult *= 1.15;
  if (p.unhappy > 60) mult *= 0.8;
  return Math.round(p.value * mult / 100000) * 100000;
}

/** Weekly wage the player expects to move (€/week) */
export function wageDemand(state: GameState, p: Player, toClub: Club): number {
  const age = ageOf(state, p);
  const base = calcWage(p.ovr, age, toClub.reputation);
  const stepUp = toClub.reputation < (p.clubId ? state.clubs[p.clubId].reputation : 50) ? 1.25 : 1.1;
  return Math.round(Math.max(base, p.wage * stepUp) / 250) * 250;
}

/** Would the player join this club? 0..1 */
export function joinWillingness(state: GameState, p: Player, toClub: Club, wage: number, years: number): number {
  const from = p.clubId ? state.clubs[p.clubId] : null;
  const age = ageOf(state, p);
  let w = 0.5;
  const repDiff = toClub.reputation - (from?.reputation ?? 40);
  w += repDiff * 0.012;
  const demand = wageDemand(state, p, toClub);
  w += clamp((wage - demand) / Math.max(demand, 1), -0.6, 0.35);
  if (p.unhappy > 50) w += 0.2;
  if (p.transferListed) w += 0.25;
  if (age >= 31 && years >= 2) w += 0.1;
  if (age <= 23 && repDiff > 15) w += 0.1;
  // playing time: would he start?
  const squadAtPos = toClub.players.map((id) => state.players[id]).filter((x) => x && x.pos === p.pos);
  const better = squadAtPos.filter((x) => x.ovr > p.ovr + 2).length;
  if (better >= 2) w -= 0.18; else if (better === 0) w += 0.08;
  if (from && from.rivals.includes(toClub.id)) w -= 0.25;
  return clamp(w, 0, 1);
}

export function moveWindowOpen(state: GameState) { return state.transferWindowOpen; }

let offerSeq = 0;
export function makeOffer(state: GameState, playerId: number, toClubId: number, fee: number, wage: number, years: number, opts: { isUser?: boolean; loan?: boolean } = {}): TransferOffer {
  const p = state.players[playerId];
  const o: TransferOffer = {
    id: state.nextId.offer++ + offerSeq++, playerId, fromClubId: p.clubId ?? -1, toClubId, fee, wage, years, status: 'pending', day: state.day,
    isLoan: !!opts.loan, isUserBid: toClubId === state.manager.clubId, isUserSale: p.clubId === state.manager.clubId,
  };
  state.offers.push(o);
  return o;
}

/** AI seller decides on a pending offer targeting one of its players. */
function sellerDecision(state: GameState, o: TransferOffer, rng: RNG): 'accept' | 'reject' | 'counter' {
  const p = state.players[o.playerId];
  const ask = askingPrice(state, p);
  if (o.isLoan) {
    const age = ageOf(state, p);
    const squad = state.clubs[o.fromClubId].players.map((id) => state.players[id]);
    const rank = squad.slice().sort((a, b) => b.ovr - a.ovr).findIndex((x) => x.id === p.id);
    return rank >= 14 || (age <= 22 && rank >= 10) ? 'accept' : 'reject';
  }
  if (o.fee >= ask * 0.97) return 'accept';
  if (o.fee >= ask * 0.75) return rng.chance(0.6) ? 'counter' : 'reject';
  return 'reject';
}

export function processOffersAI(state: GameState) {
  const rng = new RNG(hashString(`${state.seed}-offers-${state.day}`));
  for (const o of state.offers) {
    if (o.status !== 'pending') continue;
    const p = state.players[o.playerId];
    if (!p || p.clubId !== o.fromClubId) { o.status = 'withdrawn'; continue; }
    const to = state.clubs[o.toClubId];
    if (o.isUserBid && !o.response) {
      if (state.day - o.day < rng.int(1, 3)) continue; // response delay
      const dec = sellerDecision(state, o, rng);
      const from = state.clubs[o.fromClubId];
      if (dec === 'accept') {
        // player decision
        const will = joinWillingness(state, p, to, o.wage, o.years);
        if (rng.chance(will)) { o.status = 'accepted'; o.response = `${from.name} have accepted your offer and ${p.name} is happy to agree personal terms. Confirm to complete the deal.`; }
        else { o.status = 'player_rejected'; o.response = `${from.name} accepted the fee, but ${p.name} turned down the move${o.wage < wageDemand(state, p, to) ? ' — he wants at least €' + Math.round(wageDemand(state, p, to)).toLocaleString() + ' per week' : ' — he prefers to stay or join a bigger club'}.`; }
        addNews(state, { category: 'transfer', title: `${p.name}: bid ${o.status === 'accepted' ? 'accepted' : 'fee accepted, player says no'}`, body: o.response, playerId: p.id, important: true });
      } else if (dec === 'counter') {
        o.counterFee = Math.round(askingPrice(state, p) / 100000) * 100000;
        o.status = 'rejected'; o.response = `${from.name} rejected the bid but would consider around €${o.counterFee.toLocaleString()}.`;
        addNews(state, { category: 'transfer', title: `${p.name}: bid rejected (counter)`, body: o.response, playerId: p.id, important: true });
      } else {
        o.status = 'rejected'; o.response = `${from.name} have rejected your offer for ${p.name}${askingPrice(state, p) > o.fee * 2 ? ' out of hand' : ''}.`;
        addNews(state, { category: 'transfer', title: `${p.name}: bid rejected`, body: o.response, playerId: p.id, important: true });
      }
    }
  }
}

export function expireOffers(state: GameState) {
  for (const o of state.offers) if (o.status === 'pending' && state.day - o.day > 14) o.status = 'withdrawn';
  if (state.offers.length > 200) state.offers = state.offers.filter((o) => o.status === 'pending' || state.day - o.day < 60);
}

export function completeTransfer(state: GameState, playerId: number, toClubId: number, fee: number, wage: number, years: number, loan = false) {
  const p = state.players[playerId];
  const from = p.clubId !== null ? state.clubs[p.clubId] : null;
  const to = state.clubs[toClubId];
  if (from) { from.players = from.players.filter((id) => id !== playerId); from.balance += fee; from.transferBudget += Math.round(fee * 0.7); from.lineup.starters = from.lineup.starters.map((x) => (x === playerId ? null : x)); from.lineup.bench = from.lineup.bench.map((x) => (x === playerId ? null : x)); }
  else state.freeAgents = state.freeAgents.filter((id) => id !== playerId);
  to.players.push(playerId); to.balance -= fee; to.transferBudget -= fee;
  p.clubId = toClubId; p.wage = wage; if (!loan) p.contractEnd = state.seasonYear + years; p.joinedDay = state.day; p.transferListed = false; p.unhappy = 0; p.morale = clamp(p.morale + 10, 0, 100);
  p.loanFrom = loan && from ? from.id : null;
  // squad number
  const taken = new Set(to.players.map((id) => state.players[id]?.number));
  if (taken.has(p.number) || !p.number) { let n = 2; while (taken.has(n)) n++; p.number = n; }
  state.transfers.unshift({ day: state.day, season: seasonLabel(state.seasonYear), playerId, playerName: p.name, fromId: from?.id ?? null, toId: toClubId, fee, loan });
  if (state.transfers.length > 600) state.transfers.length = 600;
  const notable = fee >= 25e6 || toClubId === state.manager.clubId || from?.id === state.manager.clubId;
  if (notable) addNews(state, { category: 'transfer', title: `${p.name} ${loan ? 'joins' : 'signs for'} ${to.name}`, body: `${to.name} have ${loan ? 'taken' : 'signed'} ${p.name} ${from ? `from ${from.name}` : 'on a free transfer'}${loan ? ' on loan until the end of the season' : ` for ${fee ? '€' + (fee / 1e6).toFixed(1) + 'M' : 'free'}`}. ${loan ? '' : `Contract until ${state.seasonYear + years}.`}`, playerId, clubId: toClubId, important: toClubId === state.manager.clubId || from?.id === state.manager.clubId });
}

export function releasePlayer(state: GameState, playerId: number) {
  const p = state.players[playerId];
  if (p.clubId === null) return;
  const club = state.clubs[p.clubId];
  club.players = club.players.filter((id) => id !== playerId);
  club.lineup.starters = club.lineup.starters.map((x) => (x === playerId ? null : x)); club.lineup.bench = club.lineup.bench.map((x) => (x === playerId ? null : x));
  // compensation: remaining contract wages * 0.5
  const remainingWeeks = Math.max(0, (p.contractEnd - state.seasonYear) * 52 - 26);
  club.balance -= Math.round(remainingWeeks * p.wage * 0.5);
  p.clubId = null; state.freeAgents.push(playerId);
}

export function contractDemand(state: GameState, p: Player): { wage: number; years: number } {
  const club = state.clubs[p.clubId!];
  const age = ageOf(state, p);
  const base = calcWage(p.ovr, age, club.reputation);
  const wage = Math.round(Math.max(base * 1.05, p.wage * 1.12) / 250) * 250;
  const years = age >= 32 ? 1 : age >= 29 ? 2 : age <= 22 ? 4 : 3;
  return { wage, years };
}

/** User offers a new contract. Returns accepted? */
export function offerContract(state: GameState, playerId: number, wage: number, years: number): { ok: boolean; msg: string } {
  const p = state.players[playerId];
  const d = contractDemand(state, p);
  const rng = new RNG(hashString(`${state.seed}-contract-${playerId}-${state.day}`));
  let w = 0.5 + clamp((wage - d.wage) / d.wage, -0.6, 0.4) * 1.5;
  if (p.unhappy > 60) w -= 0.3;
  if (p.morale > 75) w += 0.1;
  if (years > d.years + 1 && ageOf(state, p) >= 30) w -= 0.15;
  if (rng.chance(clamp(w, 0.02, 0.98))) {
    p.wage = wage; p.contractEnd = state.seasonYear + years; p.morale = clamp(p.morale + 8, 0, 100); p.unhappy = Math.max(0, p.unhappy - 30);
    addNews(state, { category: 'contract', title: `${p.name} signs new deal`, body: `${p.name} has signed a new contract until ${p.contractEnd} worth €${wage.toLocaleString()} per week.`, playerId });
    return { ok: true, msg: `${p.name} has signed until ${p.contractEnd}.` };
  }
  p.unhappy = clamp(p.unhappy + 5, 0, 100);
  return { ok: false, msg: `${p.name} rejected the offer. He wants around €${d.wage.toLocaleString()}/week on a ${d.years}-year deal.` };
}

// ───────────────────────── AI transfer market ─────────────────────────
const POS_NEED: Record<Pos, number> = { GK: 2, CB: 4, LB: 2, RB: 2, DM: 2, CM: 3, AM: 2, LW: 2, RW: 2, ST: 3 };

function squadNeeds(state: GameState, club: Club): { pos: Pos; urgency: number; targetOvr: number }[] {
  const squad = club.players.map((id) => state.players[id]).filter(Boolean);
  const needs: { pos: Pos; urgency: number; targetOvr: number }[] = [];
  const xi = squad.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 14);
  const avg = xi.reduce((s, p) => s + p.ovr, 0) / Math.max(1, xi.length);
  for (const pos of ALL_POS) {
    const have = squad.filter((p) => p.pos === pos || p.altPos.includes(pos)).sort((a, b) => b.ovr - a.ovr);
    const want = POS_NEED[pos];
    const primary = squad.filter((p) => p.pos === pos).length;
    if (primary < Math.ceil(want / 2)) needs.push({ pos, urgency: 3, targetOvr: avg });
    else if (have.length < want) needs.push({ pos, urgency: 1.5, targetOvr: avg - 4 });
    else if (have[0] && have[0].ovr < avg - 6) needs.push({ pos, urgency: 1.2, targetOvr: avg + 1 });
  }
  if (squad.length < 20) needs.push({ pos: ALL_POS[Math.floor(Math.random() * 10)], urgency: 2, targetOvr: avg - 3 });
  return needs.sort((a, b) => b.urgency - a.urgency);
}

export function weeklyTransfers(state: GameState) {
  const rng = new RNG(hashString(`${state.seed}-market-${state.day}`));
  const windowOpen = state.transferWindowOpen;
  const clubs = Object.values(state.clubs).filter((c) => c.id !== state.manager.clubId && c.tier === 1);
  // AI listing: surplus players
  for (const c of clubs) {
    const squad = c.players.map((id) => state.players[id]).filter(Boolean);
    if (squad.length > 27 && rng.chance(0.5)) { const worst = squad.slice().sort((a, b) => a.ovr - b.ovr)[0]; worst.transferListed = true; }
  }
  if (!windowOpen) {
    // AI contract renewals during season
    for (const c of clubs) if (rng.chance(0.3)) aiRenew(state, c, rng);
    return;
  }
  const buyers = rng.shuffle(clubs).slice(0, 45);
  let deals = 0;
  for (const buyer of buyers) {
    if (deals > 14) break;
    const needs = squadNeeds(state, buyer);
    if (!needs.length) continue;
    if (!rng.chance(0.55)) continue;
    const need = needs[0];
    const budget = buyer.transferBudget;
    // candidates: players at other clubs (not user's unless we make an offer), free agents
    const cands: { p: Player; score: number; fee: number }[] = [];
    for (const p of Object.values(state.players)) {
      if (p.clubId === buyer.id) continue;
      if (p.pos !== need.pos && !p.altPos.includes(need.pos)) continue;
      if (p.injury && p.injury.daysLeft > 60) continue;
      const age = ageOf(state, p);
      if (age > 33) continue;
      const fee = p.clubId === null ? 0 : askingPrice(state, p);
      if (fee > budget) continue;
      if (p.ovr < need.targetOvr - 5 || p.ovr > need.targetOvr + 9) continue;
      const wage = wageDemand(state, p, buyer);
      const wages = buyer.players.reduce((s, id) => s + (state.players[id]?.wage ?? 0), 0);
      if (wages + wage > buyer.wageBudget * 1.05) continue;
      const fromClub = p.clubId !== null ? state.clubs[p.clubId] : null;
      if (fromClub && fromClub.reputation > buyer.reputation + 12 && !p.transferListed) continue;
      let score = p.ovr + (p.pot - p.ovr) * (age <= 23 ? 0.5 : 0.1) - fee / 8e6 + rng.float(0, 6);
      if (p.transferListed) score += 4;
      if (p.clubId === state.manager.clubId) score -= 3;
      cands.push({ p, score, fee });
    }
    if (!cands.length) continue;
    cands.sort((a, b) => b.score - a.score);
    const pick = cands[rng.int(0, Math.min(2, cands.length - 1))];
    const p = pick.p;
    const wage = wageDemand(state, p, buyer);
    if (p.clubId === state.manager.clubId) {
      // offer to user
      if (state.offers.some((o) => o.playerId === p.id && o.status === 'pending')) continue;
      const fee = Math.round(pick.fee * rng.float(0.85, 1.1) / 100000) * 100000;
      const o = makeOffer(state, p.id, buyer.id, fee, wage, ageOf(state, p) >= 30 ? 2 : 4);
      o.response = `${buyer.name} have made an offer of €${(fee / 1e6).toFixed(1)}M for ${p.name}.`;
      addNews(state, { category: 'transfer', title: `Bid received for ${p.name}`, body: `${buyer.name} have offered €${(fee / 1e6).toFixed(1)}M for ${p.name} (valued at €${(p.value / 1e6).toFixed(1)}M). Respond in the Transfers screen.`, playerId: p.id, important: true });
      continue;
    }
    const will = joinWillingness(state, p, buyer, wage, 4);
    if (!rng.chance(will * 0.9)) continue;
    completeTransfer(state, p.id, buyer.id, pick.fee, wage, ageOf(state, p) >= 30 ? 2 : rng.int(3, 5));
    deals++;
  }
  // Free agents to clubs needing bodies
  for (const c of clubs) {
    if (c.players.length >= 20) continue;
    const fa = state.freeAgents.map((id) => state.players[id]).filter((p) => p && ageOf(state, p) <= 34).sort((a, b) => b.ovr - a.ovr)[0];
    if (fa) completeTransfer(state, fa.id, c.id, 0, wageDemand(state, fa, c), 2);
  }
}

function aiRenew(state: GameState, club: Club, rng: RNG) {
  const squad = club.players.map((id) => state.players[id]).filter(Boolean);
  const avg = squad.reduce((s, p) => s + p.ovr, 0) / Math.max(1, squad.length);
  for (const p of squad) {
    if (p.contractEnd > state.seasonYear + 1) continue;
    const age = ageOf(state, p);
    if (p.ovr >= avg - 4 && age <= 32 && rng.chance(0.4)) { const d = contractDemand(state, p); p.wage = d.wage; p.contractEnd = state.seasonYear + 1 + d.years; }
  }
}

export function playerValueRefresh(state: GameState, p: Player) { p.value = calcValue(p.ovr, ageOf(state, p), p.pot, p.pos); }

/** Search helper for the UI */
export function searchPlayers(state: GameState, q: { text?: string; pos?: Pos | 'ANY'; minOvr?: number; maxAge?: number; maxValue?: number; listedOnly?: boolean; freeOnly?: boolean; nation?: string; excludeClub?: number }, limit = 200): Player[] {
  const text = (q.text ?? '').toLowerCase();
  const out: Player[] = [];
  for (const p of Object.values(state.players)) {
    if (q.excludeClub !== undefined && p.clubId === q.excludeClub) continue;
    if (q.freeOnly && p.clubId !== null) continue;
    if (q.listedOnly && !p.transferListed) continue;
    if (q.pos && q.pos !== 'ANY' && p.pos !== q.pos && !p.altPos.includes(q.pos)) continue;
    if (q.minOvr && p.ovr < q.minOvr) continue;
    if (q.maxAge && ageOf(state, p) > q.maxAge) continue;
    if (q.maxValue && p.value > q.maxValue) continue;
    if (q.nation && p.nat !== q.nation) continue;
    if (text && !p.name.toLowerCase().includes(text)) continue;
    out.push(p);
  }
  return out.sort((a, b) => b.ovr - a.ovr).slice(0, limit);
}
