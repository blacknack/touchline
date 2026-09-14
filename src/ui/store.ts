import { create } from 'zustand';
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';
import { GameState, Fixture, Tactic, Lineup, MatchResult, Pos } from '../engine/types';
import { createGame } from '../engine/game';
import { advanceDay, finishDay, applyResult, buildMatchOptions, StopReason, nextUserFixture } from '../engine/sim';
import { MatchSim } from '../engine/match/engine';
import { repairLineup } from '../engine/tactics';
import { makeOffer, completeTransfer, releasePlayer, offerContract } from '../engine/transfers';
import { addNews } from '../engine/season';

export type Screen = 'start' | 'home' | 'squad' | 'tactics' | 'fixtures' | 'competitions' | 'transfers' | 'finances' | 'club' | 'stats' | 'history' | 'match' | 'player' | 'inbox' | 'staff';

export interface SaveMeta { slot: string; manager: string; club: string; season: string; day: number; savedAt: number; }

interface Store {
  state: GameState | null;
  screen: Screen;
  prevScreen: Screen;
  selectedPlayer: number | null;
  selectedClub: number | null;
  selectedComp: string | null;
  selectedFixture: number | null;
  advancing: boolean;
  advanceLog: string[];
  sim: MatchSim | null;
  matchPhase: 'pre' | 'live' | 'post';
  lastResult: MatchResult | null;
  tick: number;
  saveSlot: string;
  toast: string | null;
  storageOk: boolean | null;
  saveModal: boolean;
  // actions
  newGame: (seed: number, clubId: number, manager: string) => void;
  setScreen: (s: Screen) => void;
  openPlayer: (id: number) => void;
  openClub: (id: number) => void;
  openComp: (id: string) => void;
  openFixture: (id: number) => void;
  back: () => void;
  continueDays: (opts?: { untilMatch?: boolean; days?: number }) => Promise<void>;
  startMatch: (auto?: boolean) => void;
  endMatch: () => void;
  finishMatchDay: () => void;
  bump: () => void;
  save: (slot?: string) => Promise<void>;
  load: (slot: string) => Promise<boolean>;
  listSaves: () => Promise<SaveMeta[]>;
  deleteSave: (slot: string) => Promise<void>;
  setLineup: (lineup: Lineup) => void;
  setTactic: (t: Tactic) => void;
  bid: (playerId: number, fee: number, wage: number, years: number, loan?: boolean) => void;
  confirmOffer: (offerId: number) => void;
  rejectOffer: (offerId: number) => void;
  acceptSale: (offerId: number) => void;
  release: (playerId: number) => void;
  renew: (playerId: number, wage: number, years: number) => { ok: boolean; msg: string };
  toggleList: (playerId: number) => void;
  toggleShortlist: (playerId: number) => void;
  setTraining: (t: GameState['clubs'][number]['training']) => void;
  markRead: (id: number) => void;
  showToast: (t: string) => void;
  probeStorage: () => Promise<boolean>;
  exportSave: () => string | null;
  importSave: (json: string) => Promise<boolean>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useStore = create<Store>((set, get) => ({
  state: null, screen: 'start', prevScreen: 'home', selectedPlayer: null, selectedClub: null, selectedComp: null, selectedFixture: null,
  advancing: false, advanceLog: [], sim: null, matchPhase: 'pre', lastResult: null, tick: 0, saveSlot: 'slot1', toast: null, storageOk: null, saveModal: false,

  newGame: (seed, clubId, manager) => {
    const state = createGame(seed, clubId, manager);
    set({ state, screen: 'home', selectedClub: clubId, selectedComp: state.clubs[clubId].leagueId, tick: Date.now() });
    void get().save();
  },
  setScreen: (s) => set((st) => ({ prevScreen: st.screen === s ? st.prevScreen : st.screen, screen: s })),
  openPlayer: (id) => set((st) => ({ selectedPlayer: id, prevScreen: st.screen, screen: 'player' })),
  openClub: (id) => set((st) => ({ selectedClub: id, prevScreen: st.screen, screen: 'club' })),
  openComp: (id) => set((st) => ({ selectedComp: id, prevScreen: st.screen, screen: 'competitions' })),
  openFixture: (id) => set((st) => ({ selectedFixture: id, prevScreen: st.screen, screen: 'fixtures' })),
  back: () => set((st) => ({ screen: st.prevScreen === 'player' || st.prevScreen === 'start' ? 'home' : st.prevScreen })),
  bump: () => set({ tick: Date.now() }),

  continueDays: async (opts = {}) => {
    const { state } = get();
    if (!state || get().advancing) return;
    set({ advancing: true, advanceLog: [] });
    let stop: StopReason = null;
    let days = 0;
    const maxDays = opts.days ?? 400;
    await sleep(10);
    try {
    while (days < maxDays) {
      stop = advanceDay(state);
      days++;
      if (stop === 'match') { set({ screen: 'match', matchPhase: 'pre', sim: null, lastResult: null }); break; }
      if (stop === 'season') { set({ screen: 'home' }); break; }
      if (stop === 'sacked') { set({ screen: 'home' }); break; }
      if (stop === 'inbox' || stop === 'offer') { if (!opts.untilMatch) { set({ screen: 'home' }); break; } }
      if (days % 3 === 0) { set({ tick: Date.now() }); await sleep(0); }
    }
    } catch (e) { console.error(e); get().showToast('Simulation error: ' + (e as Error).message); }
    set({ advancing: false, tick: Date.now() });
    if (stop !== 'match') void get().save();
  },

  startMatch: (auto) => {
    const { state } = get();
    if (!state || state.pendingUserFixture === null) return;
    const f = state.fixtures[state.pendingUserFixture];
    const club = state.clubs[state.manager.clubId];
    club.lineup = repairLineup(club, state.players, f.compId);
    const userSide = f.homeId === club.id ? 'H' : 'A';
    const opts = buildMatchOptions(state, f, userSide, club.lineup, club.tactic);
    opts.autoSubs = auto ?? state.options.autoSubs;
    const sim = new MatchSim(state.players, state.clubs[f.homeId], state.clubs[f.awayId], f, opts);
    set({ sim, matchPhase: 'live', tick: Date.now() });
  },
  endMatch: () => {
    const { state, sim } = get();
    if (!state || !sim) return;
    const f = sim.fixture;
    while (!sim.finished) sim.step();
    const r = sim.result();
    applyResult(state, f, r);
    state.lastMatchResult = f.id;
    set({ matchPhase: 'post', lastResult: r, tick: Date.now() });
  },
  finishMatchDay: () => {
    const { state } = get();
    if (!state) return;
    const stop = finishDay(state);
    set({ sim: null, matchPhase: 'pre', screen: 'home', tick: Date.now() });
    void get().save();
    void stop;
  },

  save: async (slot) => {
    const { state } = get();
    if (!state) return;
    const s = slot ?? get().saveSlot;
    try {
      const club = state.clubs[state.manager.clubId];
      const meta: SaveMeta = { slot: s, manager: state.manager.name, club: club.name, season: `${state.seasonYear}/${String(state.seasonYear + 1).slice(2)}`, day: state.day, savedAt: Date.now() };
      await idbSet(`tm:${s}`, state);
      await idbSet(`tm:${s}:meta`, meta);
      set({ saveSlot: s });
    } catch (e) { console.warn('save failed', e); get().showToast('Save failed (storage unavailable)'); }
  },
  load: async (slot) => {
    try {
      const state = (await idbGet(`tm:${slot}`)) as GameState | undefined;
      if (!state) return false;
      set({ state, saveSlot: slot, screen: state.pendingUserFixture !== null ? 'match' : 'home', matchPhase: 'pre', sim: null, selectedClub: state.manager.clubId, selectedComp: state.clubs[state.manager.clubId].leagueId, tick: Date.now() });
      return true;
    } catch { return false; }
  },
  listSaves: async () => {
    try {
      const ks = (await idbKeys()) as string[];
      const metas: SaveMeta[] = [];
      for (const k of ks) if (typeof k === 'string' && k.endsWith(':meta')) { const m = (await idbGet(k)) as SaveMeta; if (m) metas.push(m); }
      return metas.sort((a, b) => b.savedAt - a.savedAt);
    } catch { return []; }
  },
  deleteSave: async (slot) => { try { await idbDel(`tm:${slot}`); await idbDel(`tm:${slot}:meta`); } catch { /* ignore */ } },

  setLineup: (lineup) => { const { state } = get(); if (!state) return; state.clubs[state.manager.clubId].lineup = lineup; set({ tick: Date.now() }); },
  setTactic: (t) => { const { state, sim } = get(); if (!state) return; state.clubs[state.manager.clubId].tactic = t; if (sim && get().matchPhase === 'live') sim.setTactic(sim.fixture.homeId === state.manager.clubId ? 'H' : 'A', t); set({ tick: Date.now() }); },
  bid: (playerId, fee, wage, years, loan) => {
    const { state } = get(); if (!state) return;
    const p = state.players[playerId];
    const o = makeOffer(state, playerId, state.manager.clubId, fee, wage, years, { isUser: true, loan });
    if (p.clubId === null) {
      // free agent: instant decision
      o.status = 'accepted'; o.response = `${p.name} is a free agent and will sign if you confirm.`;
    }
    set({ tick: Date.now() });
    get().showToast(p.clubId === null ? 'Contract offer made' : `Bid submitted to ${state.clubs[p.clubId].name}`);
  },
  confirmOffer: (offerId) => {
    const { state } = get(); if (!state) return;
    const o = state.offers.find((x) => x.id === offerId); if (!o || o.status !== 'accepted') return;
    const p = state.players[o.playerId];
    if (o.fee > state.clubs[state.manager.clubId].transferBudget + 1) { get().showToast('Not enough transfer budget'); return; }
    completeTransfer(state, o.playerId, state.manager.clubId, o.fee, o.wage, o.years, !!o.isLoan);
    o.status = 'completed';
    set({ tick: Date.now() });
    get().showToast(`${p.name} has joined the club!`);
    void get().save();
  },
  rejectOffer: (offerId) => { const { state } = get(); if (!state) return; const o = state.offers.find((x) => x.id === offerId); if (o) o.status = o.isUserSale ? 'rejected' : 'withdrawn'; set({ tick: Date.now() }); },
  acceptSale: (offerId) => {
    const { state } = get(); if (!state) return;
    const o = state.offers.find((x) => x.id === offerId); if (!o || !o.isUserSale) return;
    completeTransfer(state, o.playerId, o.toClubId, o.fee, o.wage, o.years, !!o.isLoan);
    o.status = 'completed';
    set({ tick: Date.now() });
    void get().save();
  },
  release: (playerId) => { const { state } = get(); if (!state) return; const name = state.players[playerId].name; releasePlayer(state, playerId); addNews(state, { category: 'contract', title: `${name} released`, body: `${name} has been released from his contract.` }); set({ tick: Date.now() }); },
  renew: (playerId, wage, years) => { const { state } = get(); if (!state) return { ok: false, msg: '' }; const r = offerContract(state, playerId, wage, years); set({ tick: Date.now() }); return r; },
  toggleList: (playerId) => { const { state } = get(); if (!state) return; const p = state.players[playerId]; p.transferListed = !p.transferListed; set({ tick: Date.now() }); },
  toggleShortlist: (playerId) => { const { state } = get(); if (!state) return; const i = state.shortlist.indexOf(playerId); if (i >= 0) state.shortlist.splice(i, 1); else state.shortlist.push(playerId); set({ tick: Date.now() }); },
  setTraining: (t) => { const { state } = get(); if (!state) return; state.clubs[state.manager.clubId].training = t; set({ tick: Date.now() }); },
  markRead: (id) => { const { state } = get(); if (!state) return; const n = state.news.find((x) => x.id === id); if (n) n.read = true; set({ tick: Date.now() }); },
  showToast: (t) => { set({ toast: t }); setTimeout(() => set((s) => (s.toast === t ? { toast: null } : {})), 2600); },
  probeStorage: async () => {
    try { await idbSet('tm:probe', Date.now()); const v = await idbGet('tm:probe'); const ok = v !== undefined; set({ storageOk: ok }); return ok; }
    catch { set({ storageOk: false }); return false; }
  },
  exportSave: () => { const { state } = get(); if (!state) return null; return JSON.stringify(state); },
  importSave: async (json) => {
    try {
      const state = JSON.parse(json) as GameState;
      if (!state || !state.clubs || !state.manager) return false;
      set({ state, screen: state.pendingUserFixture !== null ? 'match' : 'home', matchPhase: 'pre', sim: null, selectedClub: state.manager.clubId, selectedComp: state.clubs[state.manager.clubId].leagueId, tick: Date.now() });
      await get().save();
      return true;
    } catch { return false; }
  },
}));

export function useGame(): GameState {
  const s = useStore((st) => st.state);
  useStore((st) => st.tick);
  if (!s) throw new Error('no game');
  return s;
}
export const nextFixtureFor = (state: GameState): Fixture | undefined => nextUserFixture(state);
export type { Pos };
