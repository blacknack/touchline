# Touchline Manager

A football management game for the 2026/27 season: Premier League, La Liga, Bundesliga, Serie A and Ligue 1, their domestic cups and super cups, the Champions League, Europa League and Conference League (league-phase format) and the UEFA Super Cup — with real clubs and squads, a minute-by-minute match engine, transfers, contracts, finances, player development, injuries, morale, a demanding board and multi-season continuity.

Built as a fast, offline web app (Vite + React + TypeScript, pure-TypeScript simulation engine). Runs in any browser and can be wrapped as a native macOS app with Tauri.

## Run it (MacBook Pro M4)

```bash
# 1. Node 20+ (brew install node)
npm install
npm run dev          # opens http://localhost:5173
```

Saves live in the browser (IndexedDB) — three slots, autosaved at every stop.

### Optional: native Mac app (Tauri)

```bash
# Rust toolchain: https://rustup.rs  (curl https://sh.rustup.rs -sSf | sh)
npx tauri icon src-tauri/icons/icon.png   # generates the icon set once
npm run tauri dev                           # native window in dev mode
npm run tauri build                         # .app / .dmg in src-tauri/target/release/bundle
```

### Single-file build (play from one HTML file, phone included)

```bash
npm run build:single   # -> dist-single/index.html
```

## What's in the box

- **5 leagues, 96 real clubs** with real squads (2025/26 squads plus the confirmed summer-2026 moves), realistic ratings, potentials, ages, nationalities, contracts and values. 38 more European clubs with real squads (Ajax, Benfica, Galatasaray, Celtic…) and ~300 further clubs (lower divisions, smaller UEFA leagues) with generated squads so every cup and European draw is populated.
- **Every competition**: FA Cup, EFL Cup, Community Shield, Copa del Rey, Supercopa, DFB-Pokal, DFL-Supercup, Coppa Italia, Supercoppa, Coupe de France, Trophée des Champions, Champions League / Europa League (36-team league phase, knockout play-offs, seeded bracket), Conference League (6 matchdays), UEFA Super Cup. Real calendar rhythm: weekend league, Tue/Wed/Thu Europe, midweek cups, international breaks, winter breaks, Boxing Day, automatic rescheduling of league games that clash with cup ties.
- **Match engine**: possession, chance quality and xG, big chances, long shots, headers from corners and crosses, direct free kicks, penalties (and misses/saves), rebounds, woodwork, VAR, offsides, fouls, yellow/second-yellow/straight red, injuries, fatigue, tactical AI (mentality, pressing, line, tempo, width, counter, time-wasting), substitutions with 5-sub/3-window rules, added time, extra time and penalty shoot-outs, live commentary, momentum, player ratings and man of the match. Calibrated to real-world averages (≈2.8 goals, 25 shots, 11 corners, 21 fouls, 3.9 yellows, 0.14 reds per game; ≈48/24/28 home/draw/away).
- **Live match day**: text commentary or a **2D aerial pitch view** — a continuous, agent-based simulation rather than canned animations: 22 players with their own pace, passing sequences with lanes and offside checked, dribbles into space, runs in behind, give-and-goes, overlapping full-backs, pressing, markers picking up runners, shapes that bend with the ball and break when it makes sense, plus every engine event played out (build-up, shots, saves, rebounds, corners, free kicks with walls, penalties, fouls, cards, VAR, subs, shoot-outs) at 1×–8×. Nothing teleports: every set piece is reached from open play (a corner comes from a blocked cross, a free kick from a tackle, a penalty from a foul in the box, an offside from a through ball that beats the line, a kick-off from the taker fetching the ball), and the commentary, scoreboard, clock and stats only update when the pitch has actually shown the moment — the text never spoils the picture; a mandatory half-time (and extra-time) break for substitutions and tactical changes; a key-moments strip; or take an instant result and let the assistant handle substitutions.
- **Saving**: three save slots with autosave, plus export/import of save files to move a career between devices (💾 in the sidebar, or *Load game* on the start screen).
- **Squad & tactics**: 12 formations, drag-and-drop pitch, roles (captain, penalties, free kicks, corners), condition/sharpness/morale, training focus.
- **Transfers**: search and shortlist, bids with counter-offers, player willingness (wages, reputation, playing time, rivalries), loans, free agents, contract negotiations, transfer listing and releases, AI clubs buying and selling all season, transfer windows and deadline day.
- **Finances**: gate receipts, broadcasting, commercial income, wages, prize money, European bonuses, board-set budgets.
- **Careers**: development curves by age and potential, monthly training, youth intake, retirements, expiring contracts, honours, awards (Ballon d'Or, Golden Boy, Golden Boot, Golden Glove, players of the month/season, top scorers), promotion/relegation, coefficient-based European qualification (including the two European Performance Spots), board confidence and sackings with job offers.

## Editing the data

Everything is plain TypeScript in `src/engine/data/`:

- `players/eng.ts`, `esp.ts`, `ger.ts`, `ita.ts`, `fra.ts` — the top-5 leagues. Each player is `[name, positions, birth year, nationality, overall, potential?]`. Ratings are FIFA-style 1–99 and the 34 detailed attributes are generated deterministically from them.
- `players/euro.ts` — other European clubs with real squads.
- `clubs_extra.ts` — clubs with generated squads (lower divisions + smaller UEFA nations).
- `season2026.ts` — last season's standings, cup winners and holders that seed the first season.

Squads reflect my best knowledge as of the 2026/27 pre-season; some transfers from January/summer 2026 will be missing or wrong — fix them in the files above, save, and start a new career. Add a club by copying an existing entry (its `short` code should be unique within the nation).

## Headless tools

```bash
npm run sim            # match-engine calibration over 600 matches
npx tsx scripts/season.ts 2   # simulate two full seasons and print tables, honours, awards
npx tsx scripts/viztest.ts 6  # stress-test the 2D match visualisation headlessly
```

## Notes

Club and player names are used descriptively for a personal, non-commercial project. No crests or likenesses are included.
