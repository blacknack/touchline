/** Compact player: [name, positions ("ST" or "ST/LW/RW"), birth year, nationality, overall, potential?] */
export type P = [string, string, number, string, number, number?];

export interface ClubDef {
  name: string;
  short: string;
  nation: string;
  league: string | null;   // domestic league competition id (top-5) or pseudo-league id for other nations
  tier: number;            // 1 = top flight
  rep: number;             // 1-100 reputation
  colors: [string, string];
  stadium: string;
  capacity: number;
  wealth: number;          // 1 (poor) .. 6 (super-rich)
  squad: P[];              // empty => generated squad
  nick?: string;
  rivals?: string[];       // short codes
  expectation?: string;    // board expectation override
}
