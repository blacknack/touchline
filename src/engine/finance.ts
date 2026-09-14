import { Fixture, GameState, MatchResult } from './types';
import { leagueOrder } from './competitions';
import { addNews } from './season';
import { clamp } from './rng';

export function ticketPrice(rep: number): number { return Math.round(18 + rep * 0.55); }

export function matchdayIncome(state: GameState, f: Fixture, r: MatchResult) {
  const home = state.clubs[f.homeId], away = state.clubs[f.awayId];
  const comp = state.competitions[f.compId];
  const gate = r.attendance * ticketPrice(home.reputation);
  if (f.neutral) { home.balance += gate * 0.4; away.balance += gate * 0.4; }
  else home.balance += gate;
  if (comp.type === 'euro') {
    const per = comp.id === 'UCL' ? [2.1e6, 0.7e6] : comp.id === 'UEL' ? [0.45e6, 0.15e6] : [0.4e6, 0.13e6];
    for (const c of [home, away]) {
      if (r.winnerId === c.id) c.balance += per[0]; else if (r.winnerId === null) c.balance += per[1];
      if (f.knockout) c.balance += comp.id === 'UCL' ? 3e6 : comp.id === 'UEL' ? 1e6 : 0.6e6; // KO round participation
    }
  }
  if (comp.type === 'cup') { for (const c of [home, away]) c.balance += comp.prizeMoney * 0.04; }
}

export function weeklyFinance(state: GameState) {
  for (const c of Object.values(state.clubs)) {
    const wages = c.players.reduce((s, id) => s + (state.players[id]?.wage ?? 0), 0);
    // commercial + TV weekly
    const leagueTv = c.tier === 1 ? (c.nation === 'ENG' ? 2.4e6 : c.nation === 'ESP' ? 1.5e6 : c.nation === 'GER' ? 1.2e6 : c.nation === 'ITA' ? 1.2e6 : c.nation === 'FRA' ? 0.6e6 : 0.15e6 + c.reputation * 3000) : 0.2e6;
    const commercial = Math.pow(c.reputation / 100, 3) * 5e6 + c.capacity * 3;
    c.balance += leagueTv + commercial - wages;
  }
  const mine = state.clubs[state.manager.clubId];
  const wages = mine.players.reduce((s, id) => s + (state.players[id]?.wage ?? 0), 0);
  if (wages > mine.wageBudget * 1.15 && state.day % 28 < 7) addNews(state, { category: 'finance', title: 'Wage bill over budget', body: `The weekly wage bill (€${wages.toLocaleString()}) exceeds the board's budget of €${mine.wageBudget.toLocaleString()}. Consider moving players on.`, important: false });
}

export function prizeMoneyEndOfSeason(state: GameState) {
  for (const comp of Object.values(state.competitions)) {
    if (comp.type === 'league' && comp.standings) {
      const order = leagueOrder(comp, state.clubs);
      order.forEach((id, i) => { const share = comp.prizeMoney * (1 - (i / order.length) * 0.85); state.clubs[id].balance += share; });
    } else if (comp.winnerId) {
      state.clubs[comp.winnerId].balance += comp.prizeMoney;
      if (comp.runnerUpId) state.clubs[comp.runnerUpId].balance += comp.prizeMoney * 0.5;
    }
  }
  // Set next season's budgets
  for (const c of Object.values(state.clubs)) {
    const wages = c.players.reduce((s, id) => s + (state.players[id]?.wage ?? 0), 0);
    const typical = 10e6 + Math.pow(Math.max(0, c.reputation - 50), 2) * 0.09e6;
    c.transferBudget = Math.max(0, Math.round(Math.min(c.balance * 0.5, typical * (c.balance > 0 ? 1 : 0.3))));
    c.wageBudget = Math.round(Math.max(wages * 1.05, c.balance * 0.0035 + wages * 0.9) / 1000) * 1000;
    c.boardConfidence = clamp(c.boardConfidence, 30, 100);
  }
}

export function fmtMoney(v: number): string {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `€${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `€${(a / 1e6).toFixed(a >= 10e6 ? 1 : 2)}M` : a >= 1e3 ? `€${(a / 1e3).toFixed(0)}K` : `€${a.toFixed(0)}`;
  return v < 0 ? `-${s}` : s;
}
