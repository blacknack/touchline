import { GameState } from './types';
import { buildWorld, SEASON_START_DAY } from './world';
import { startSeason, addNews } from './season';
import { pickLineup } from './tactics';
import { NATIONS } from './data/nations';

export const SAVE_VERSION = 1;

export function createGame(seed: number, clubId: number, managerName: string): GameState {
  const day = SEASON_START_DAY;
  const world = buildWorld(seed, day);
  const state: GameState = {
    version: SAVE_VERSION, seed, day, seasonYear: 2026,
    manager: { name: managerName, clubId, reputation: 40, history: [], seasonsInCharge: 0, unemployed: false },
    players: world.players, clubs: world.clubs, competitions: {}, fixtures: {}, news: [], offers: [], transfers: [], honours: [], awards: [],
    nextId: { player: world.nextPlayerId, fixture: 1, news: 1, offer: 1 },
    transferWindowOpen: true, scoutedIds: [], shortlist: [], lastMatchResult: null, pendingUserFixture: null,
    stats: { seasonsPlayed: 0, matchesPlayed: 0 }, euroCoefficients: {}, lastSeasonTables: {}, lastCupResults: {}, freeAgents: [], jobOffers: [], weekTraining: 0,
    options: { autoSubs: true, matchSpeed: 3, showCommentary: true },
  };
  for (const n of Object.values(NATIONS)) if (n.uefa) state.euroCoefficients[n.code] = n.coefficient;
  const club = state.clubs[clubId];
  club.managerName = managerName;
  state.manager.reputation = Math.round(club.reputation * 0.6);
  startSeason(state);
  club.lineup = pickLineup(club, state.players, club.leagueId ?? 'ALL');
  addNews(state, { category: 'board', title: `Welcome to ${club.name}`, body: `The board has appointed you as the new head coach of ${club.name}. Expectation for this season: ${club.expectation}. Transfer budget: €${(club.transferBudget / 1e6).toFixed(1)}M, wage budget €${club.wageBudget.toLocaleString()}/week.`, important: true, clubId });
  return state;
}

export function playableClubs(state: GameState) {
  return Object.values(state.clubs).filter((c) => c.tier === 1 && ['ENG1', 'ESP1', 'GER1', 'ITA1', 'FRA1'].includes(c.leagueId ?? ''));
}
