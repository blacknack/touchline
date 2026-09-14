import { createGame, playableClubs } from '../src/engine/game';
import { advanceDay, finishDay, simulateAIFixture, userFixtureOn } from '../src/engine/sim';
import { leagueOrder } from '../src/engine/competitions';
import { formatDay } from '../src/engine/attributes';
import { calendarFor } from '../src/engine/season';

const seasons = Number(process.argv[2] ?? 1);
const t0 = Date.now();
const st = createGame(12345, 1, 'Test Manager'); // Arsenal
console.log('world built in', Date.now() - t0, 'ms; players', Object.keys(st.players).length, 'clubs', Object.keys(st.clubs).length, 'fixtures', Object.keys(st.fixtures).length);
const cal = calendarFor(st);
console.log('season', st.seasonYear, 'start', formatDay(st.day), 'end', formatDay(cal.seasonEnd));

function runSeason() {
  const t = Date.now();
  let days = 0;
  let stops = 0;
  while (true) {
    const cal2 = calendarFor(st);
    if (st.day === cal2.seasonEnd) {
      for (const lid of ['ENG1', 'ESP1', 'GER1', 'ITA1', 'FRA1']) {
        const comp = st.competitions[lid];
        const rows = comp.standings!.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
        console.log(lid, rows.map((r) => `${st.clubs[r.clubId].short} ${r.pts}`).join(' '));
      }
      const ucl = st.competitions['UCL'];
      const rows = ucl.standings!.slice().sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
      console.log('UCL LP', rows.slice(0, 12).map((r) => `${st.clubs[r.clubId].short} ${r.pts}`).join(' '), '| stages drawn', ucl.stages!.map((s) => s.fixtureIds.length).join('/'));
    }
    const r = advanceDay(st);
    days++;
    if (r === 'match') {
      const f = userFixtureOn(st, st.day)!;
      simulateAIFixture(st, f);
      const r2 = finishDay(st);
      if (r2 === 'season') break;
    } else if (r === 'season') break;
    else if (r) stops++;
    if (days > 400) { console.log('runaway'); break; }
  }
  console.log(`season simulated in ${Date.now() - t}ms, ${days} days, stops ${stops}`);
}

for (let s = 0; s < seasons; s++) {
  const year = st.seasonYear;
  // sanity: fixture stats before season
  const byClub = new Map<number, number[]>();
  for (const f of Object.values(st.fixtures)) { for (const id of [f.homeId, f.awayId]) { if (!byClub.has(id)) byClub.set(id, []); byClub.get(id)!.push(f.day); } }
  runSeason();
  // After rollover, competitions are new. Use honours & news for last season.
  console.log(`\n=== Season ${year}/${String(year + 1).slice(2)} ===`);
  for (const h of st.honours.filter((h) => h.season === `${year}/${String(year + 1).slice(2)}`)) console.log(`${h.compName}: ${st.clubs[h.winnerId].name}${h.runnerUpId ? ` (runner-up ${st.clubs[h.runnerUpId].name})` : ''}${h.topScorer ? ` — top scorer ${st.players[h.topScorer.playerId]?.name} ${h.topScorer.goals}` : ''}`);
  for (const lid of ['ENG1', 'ESP1', 'GER1', 'ITA1', 'FRA1']) {
    const order = st.lastSeasonTables[lid];
    console.log(lid, order.slice(0, 6).map((id) => st.clubs[id].short).join(' ') + ' ... ' + order.slice(-3).map((id) => st.clubs[id].short).join(' '));
  }
  const awards = st.awards.filter((a) => a.season === `${year}/${String(year + 1).slice(2)}` && !a.name.includes('Month'));
  console.log(awards.map((a) => `${a.name}: ${st.players[a.playerId]?.name} (${a.detail})`).join('\n'));
  console.log('transfers last season:', st.transfers.filter((t) => t.season === `${year}/${String(year + 1).slice(2)}`).length, 'top:', st.transfers.filter((t) => t.season === `${year}/${String(year + 1).slice(2)}`).sort((a, b) => b.fee - a.fee).slice(0, 5).map((t) => `${t.playerName} ${t.fromId ? st.clubs[t.fromId].short : 'FA'}→${st.clubs[t.toId].short} €${(t.fee / 1e6).toFixed(1)}M`).join('; '));
  console.log('free agents', st.freeAgents.length, 'players', Object.keys(st.players).length, 'user club balance', (st.clubs[st.manager.clubId].balance / 1e6).toFixed(1), 'M budget', (st.clubs[st.manager.clubId].transferBudget / 1e6).toFixed(1), 'M');
}
// Detailed checks on the current (new) season fixtures: clashes
{
  const byClub = new Map<number, { day: number; comp: string }[]>();
  for (const f of Object.values(st.fixtures)) for (const id of [f.homeId, f.awayId]) { if (!byClub.has(id)) byClub.set(id, []); byClub.get(id)!.push({ day: f.day, comp: f.compId }); }
  let clashes = 0, tight = 0;
  for (const [id, list] of byClub) {
    list.sort((a, b) => a.day - b.day);
    for (let i = 1; i < list.length; i++) { if (list[i].day === list[i - 1].day) { clashes++; if (clashes < 5) console.log('CLASH', st.clubs[id].name, formatDay(list[i].day), list[i - 1].comp, list[i].comp); } else if (list[i].day - list[i - 1].day < 2) tight++; }
  }
  console.log('fixture clashes', clashes, 'tight(1 day)', tight, 'total fixtures', Object.keys(st.fixtures).length);
  const ars = st.clubs[1];
  console.log('Arsenal fixtures:', byClub.get(1)!.length, byClub.get(1)!.slice(0, 12).map((x) => `${formatDay(x.day, { year: false })} ${x.comp}`).join(', '));
}
const gs = Object.values(st.players).filter((p) => p.clubId !== null);
console.log('avg ovr top5 clubs', (gs.filter((p) => ['ENG1', 'ESP1', 'GER1', 'ITA1', 'FRA1'].includes(st.clubs[p.clubId!].leagueId ?? '')).reduce((s, p) => s + p.ovr, 0) / gs.length).toFixed(1));
console.log('total time', Date.now() - t0, 'ms');
{
  const lid = 'ENG1';
  const order = st.lastSeasonTables[lid];
  console.log('\nPL scorers last season (ALL comps):');
  const ps = Object.values(st.players).filter((p) => p.career.length && p.clubId && st.clubs[p.clubId].leagueId === lid).sort((a, b) => (b.career[b.career.length - 1]?.goals ?? 0) - (a.career[a.career.length - 1]?.goals ?? 0)).slice(0, 8);
  console.log(ps.map((p) => `${p.name} ${p.career[p.career.length - 1].goals}g/${p.career[p.career.length - 1].apps}app`).join(', '));
  void order;
  const ars = st.clubs[1];
  const wages = ars.players.reduce((s, id) => s + st.players[id].wage, 0);
  console.log('Arsenal weekly wages', (wages / 1e3).toFixed(0), 'K; top value', st.players[ars.players.slice().sort((a, b) => st.players[b].value - st.players[a].value)[0]].name, (st.players[ars.players.slice().sort((a, b) => st.players[b].value - st.players[a].value)[0]].value / 1e6).toFixed(1), 'M');
}
{
  const json = JSON.stringify(st);
  console.log('save size MB', (json.length / 1e6).toFixed(1));
  const parts: [string, number][] = (['players', 'clubs', 'fixtures', 'competitions', 'news', 'transfers'] as const).map((k) => [k, JSON.stringify((st as any)[k]).length / 1e6]);
  console.log(parts.map(([k, v]) => `${k}:${v.toFixed(1)}MB`).join(' '));
}
