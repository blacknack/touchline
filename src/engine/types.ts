// ─────────────────────────────────────────────────────────────────────────────
// Touchline Manager — core domain types
// ─────────────────────────────────────────────────────────────────────────────

export type Pos = 'GK' | 'CB' | 'LB' | 'RB' | 'DM' | 'CM' | 'AM' | 'LW' | 'RW' | 'ST';
export const ALL_POS: Pos[] = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];

export interface Attributes {
  // technical
  finishing: number;
  passing: number;
  dribbling: number;
  crossing: number;
  tackling: number;
  heading: number;
  technique: number;
  longShots: number;
  marking: number;
  freeKicks: number;
  penalties: number;
  corners: number;
  // mental
  positioning: number;
  vision: number;
  composure: number;
  workRate: number;
  aggression: number;
  anticipation: number;
  decisions: number;
  leadership: number;
  flair: number;
  // physical
  pace: number;
  acceleration: number;
  stamina: number;
  strength: number;
  agility: number;
  jumping: number;
  balance: number;
  // goalkeeping
  reflexes: number;
  handling: number;
  kicking: number;
  aerialReach: number;
  oneOnOnes: number;
  command: number;
}
export type AttrKey = keyof Attributes;

export interface Injury {
  type: string;
  daysLeft: number;
  totalDays: number;
}

export interface SeasonStats {
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  yellows: number;
  reds: number;
  cleanSheets: number;
  ratingSum: number;
  motm: number;
  pensScored: number;
  pensMissed: number;
  saves: number;
  conceded: number;
}
export const emptyStats = (): SeasonStats => ({
  apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellows: 0, reds: 0,
  cleanSheets: 0, ratingSum: 0, motm: 0, pensScored: 0, pensMissed: 0, saves: 0, conceded: 0,
});

export interface CareerEntry {
  season: string; // "2026/27"
  clubId: number;
  clubName: string;
  apps: number;
  goals: number;
  assists: number;
  avgRating: number;
}

export interface Player {
  id: number;
  name: string;
  pos: Pos;
  altPos: Pos[];
  born: number;         // birth year
  bornDay: number;      // day-of-year 1..365 for age precision
  nat: string;          // ISO-3 code
  attrs: Attributes;
  ovr: number;          // derived overall 1-99
  pot: number;          // potential overall
  clubId: number | null;
  value: number;        // €
  wage: number;         // € per week
  contractEnd: number;  // season-end year (e.g. 2028 => contract runs to 30 June 2028)
  number: number;
  morale: number;       // 0-100
  condition: number;    // 0-100 (energy)
  sharpness: number;    // 0-100 match fitness
  injury: Injury | null;
  suspension: Record<string, number>; // compId -> matches remaining
  yellowsInComp: Record<string, number>;
  form: number[];       // last 5 ratings
  stats: Record<string, SeasonStats>; // compId -> stats (this season); "ALL" aggregated
  career: CareerEntry[];
  regen: boolean;
  loanFrom: number | null;
  transferListed: boolean;
  joinedDay: number;
  unhappy: number;      // 0-100 grievance
  preferredFoot: 'L' | 'R';
  traits: string[];
}

export interface Tactic {
  formation: string;          // e.g. "4-3-3"
  mentality: 'very-defensive' | 'defensive' | 'balanced' | 'attacking' | 'very-attacking';
  tempo: 'slow' | 'normal' | 'fast';
  width: 'narrow' | 'normal' | 'wide';
  pressing: 'low' | 'medium' | 'high';
  line: 'deep' | 'normal' | 'high';
  passing: 'short' | 'mixed' | 'direct';
  counter: boolean;
  timeWasting: boolean;
}

export interface Lineup {
  starters: (number | null)[];  // 11 slots in formation order (index 0 = GK)
  bench: (number | null)[];     // up to 9
  captain: number | null;
  penaltyTaker: number | null;
  freeKickTaker: number | null;
  cornerTaker: number | null;
}

export interface Club {
  id: number;
  name: string;
  short: string;       // 3-letter code
  nick?: string;
  nation: string;      // ISO-3
  leagueId: string | null;  // competition id of the domestic league (null for abstract clubs)
  tier: number;        // division level in nation
  reputation: number;  // 1-100
  colors: [string, string];
  stadium: string;
  capacity: number;
  players: number[];
  tactic: Tactic;
  lineup: Lineup;
  balance: number;        // €
  transferBudget: number; // €
  wageBudget: number;     // € per week
  managerName: string;
  boardConfidence: number; // 0-100
  fanHappiness: number;    // 0-100
  expectation: string;     // e.g. "title", "top4", "europe", "midtable", "survival"
  honours: { season: string; compId: string; compName: string }[];
  rivals: number[];
  generatedSquad: boolean;
  seasonPoints?: number;
  coefficient: number;     // uefa-like coefficient accumulating from European results
  training: TrainingFocus;
}

export type TrainingFocus = 'balanced' | 'attacking' | 'defending' | 'physical' | 'technical' | 'tactical' | 'setpieces' | 'rest';

export type CompType = 'league' | 'cup' | 'euro' | 'supercup';

export interface CupStage {
  name: string;            // "Round 3", "Quarter-final"
  twoLegged: boolean;
  neutral: boolean;
  entrants?: number[];     // ids entering at this stage (for staggered entry)
  extraTime: boolean;
  replays: boolean;        // unused
  day: number;             // scheduled day (first leg)
  day2?: number;           // second leg
  drawn: boolean;
  fixtureIds: number[];
  byes?: number[];
}

export interface Competition {
  id: string;
  name: string;
  short: string;
  type: CompType;
  nation: string | null; // ISO-3 or null for UEFA
  level: number;         // league tier
  teams: number[];
  // league
  standings?: Standing[];
  rounds?: number;
  // league-phase (euro) — standings + knockouts
  stages?: CupStage[];
  currentStage?: number;
  // qualification info for leagues
  promotion?: number;     // slots promoted (for tier 2)
  relegation?: number;
  winnerId?: number | null;
  runnerUpId?: number | null;
  finished: boolean;
  seasonFixtures: number[];
  prizeMoney: number;    // € to winner
  reputation: number;    // 1-100
  color: string;
  /** For euro comps: mapping of clubId -> pot */
  pots?: Record<number, number>;
  /** knockout bracket seedings for euro comps */
  bracket?: Record<string, number[]>;
  lowerHosts?: boolean[];
}

export interface Standing {
  clubId: number;
  p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number;
  form: string[]; // 'W' | 'D' | 'L'
  deduction: number;
}

export type EventType =
  | 'kickoff' | 'halftime' | 'secondhalf' | 'fulltime' | 'et_start' | 'et_half' | 'et_end'
  | 'goal' | 'pen_goal' | 'pen_miss' | 'pen_saved' | 'own_goal' | 'header_goal' | 'fk_goal' | 'longshot_goal'
  | 'shot' | 'shot_off' | 'shot_blocked' | 'save' | 'big_save' | 'post' | 'chance_miss' | 'big_chance'
  | 'corner' | 'freekick' | 'penalty_awarded' | 'offside' | 'foul'
  | 'yellow' | 'second_yellow' | 'red' | 'injury' | 'sub' | 'var' | 'var_overturn'
  | 'shootout_goal' | 'shootout_miss' | 'shootout_start' | 'shootout_end'
  | 'momentum' | 'tactic' | 'commentary' | 'added_time';

export interface MatchEvent {
  minute: number;
  added: number;        // stoppage-time minute
  type: EventType;
  side: 'H' | 'A' | null;
  playerId?: number;
  secondaryId?: number; // assist / player subbed on / fouled player
  text: string;
  score?: [number, number];
  xg?: number;
}

export interface TeamMatchStats {
  possession: number;
  shots: number;
  onTarget: number;
  blocked: number;
  xg: number;
  corners: number;
  fouls: number;
  offsides: number;
  yellows: number;
  reds: number;
  saves: number;
  bigChances: number;
  passes: number;
  passAcc: number;
  tackles: number;
}

export interface MatchResult {
  fixtureId: number;
  homeId: number;
  awayId: number;
  hg: number;           // full score incl. ET
  ag: number;
  ftHg: number;         // score after 90
  ftAg: number;
  et: boolean;
  pens?: [number, number];
  winnerId: number | null; // for knockouts (after pens); null for draw
  events: MatchEvent[];
  stats: { H: TeamMatchStats; A: TeamMatchStats };
  ratings: Record<number, number>;
  minutes: Record<number, number>;
  lineups: { H: number[]; A: number[] };
  benches: { H: number[]; A: number[] };
  motm: number;
  attendance: number;
  scorers: { H: { playerId: number; minute: number; type: string }[]; A: { playerId: number; minute: number; type: string }[] };
}

export interface Fixture {
  id: number;
  compId: string;
  stage: number;         // round index (league) or stage index (cup)
  stageName: string;
  homeId: number;
  awayId: number;
  day: number;
  leg: 1 | 2 | 0;
  tieId: number | null;   // pairs two-legged fixtures
  neutral: boolean;
  played: boolean;
  result: MatchResult | null;
  knockout: boolean;      // must produce winner (ET + pens)
  aggregateOf?: number;   // fixture id of first leg
}

export interface NewsItem {
  id: number;
  day: number;
  category: 'match' | 'transfer' | 'injury' | 'board' | 'contract' | 'competition' | 'award' | 'general' | 'youth' | 'finance' | 'scouting';
  title: string;
  body: string;
  read: boolean;
  clubId?: number;
  playerId?: number;
  fixtureId?: number;
  important?: boolean;
}

export interface TransferOffer {
  id: number;
  playerId: number;
  fromClubId: number;
  toClubId: number;
  fee: number;
  wage: number;
  years: number;
  status: 'pending' | 'accepted' | 'rejected' | 'player_rejected' | 'completed' | 'withdrawn';
  day: number;
  response?: string;
  isLoan?: boolean;
  isUserBid: boolean;    // user is buyer
  isUserSale: boolean;   // user is seller
  counterFee?: number;
}

export interface TransferRecord {
  day: number;
  season: string;
  playerId: number;
  playerName: string;
  fromId: number | null;
  toId: number;
  fee: number;
  loan: boolean;
}

export interface Manager {
  name: string;
  clubId: number;
  reputation: number;
  history: { season: string; clubId: number; clubName: string; leaguePos: number | null; honours: string[] }[];
  seasonsInCharge: number;
  unemployed: boolean;
}

export interface SeasonHonour {
  season: string;
  compId: string;
  compName: string;
  winnerId: number;
  runnerUpId: number | null;
  topScorer?: { playerId: number; goals: number };
}

export interface Award {
  season: string;
  name: string;
  playerId: number;
  playerName: string;
  clubId: number;
  detail: string;
}

export interface GameState {
  version: number;
  seed: number;
  day: number;            // days since 2026-07-01
  seasonYear: number;     // 2026 => 2026/27
  manager: Manager;
  players: Record<number, Player>;
  clubs: Record<number, Club>;
  competitions: Record<string, Competition>;
  fixtures: Record<number, Fixture>;
  news: NewsItem[];
  offers: TransferOffer[];
  transfers: TransferRecord[];
  honours: SeasonHonour[];
  awards: Award[];
  nextId: { player: number; fixture: number; news: number; offer: number };
  transferWindowOpen: boolean;
  scoutedIds: number[];
  shortlist: number[];
  lastMatchResult: number | null; // fixture id of user's last match
  pendingUserFixture: number | null;
  stats: { seasonsPlayed: number; matchesPlayed: number };
  euroCoefficients: Record<string, number>; // nation -> coefficient
  lastSeasonTables: Record<string, number[]>; // compId -> ordered club ids
  lastCupResults: Record<string, { winner: number | null; finalist: number | null }>;
  freeAgents: number[];
  jobOffers: { clubId: number; day: number }[];
  weekTraining: number;
  options: { autoSubs: boolean; matchSpeed: number; showCommentary: boolean; matchView?: 'text' | '2d' };
  seasonReview?: SeasonReview | null;
}

export interface SeasonReview {
  season: string;
  clubId: number;
  clubName: string;
  leagueName: string;
  position: number;
  table: { clubId: number; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }[];
  record: { w: number; d: number; l: number; gf: number; ga: number; apps: number };
  honours: string[];
  cupRuns: { comp: string; stage: string }[];
  awards: { name: string; playerName: string; detail: string }[];
  topScorer: { name: string; goals: number } | null;
  bestPlayer: { name: string; avg: number } | null;
  boardVerdict: string;
  seen: boolean;
}

export interface Nation {
  code: string;
  name: string;
  adj: string;      // demonym
  flag: string;     // emoji
  uefa: boolean;
  coefficient: number;
}
