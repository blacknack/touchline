import { dateToDay, dayOfWeek } from './attributes';

/** Season calendar helpers. All "week" dates are anchored to the Mon-Sun week containing a reference date. */
export function weekDay(year: number, month: number, day: number, targetDow: number): number {
  // returns day index of the `targetDow` (0=Sun..6=Sat) in the Mon-Sun week containing (year,month,day)
  const d = dateToDay(year, month, day);
  const dow = dayOfWeek(d); // 0 Sun .. 6 Sat
  const monday = d - ((dow + 6) % 7);
  const offset = targetDow === 0 ? 6 : targetDow - 1;
  return monday + offset;
}
export const sat = (y: number, m: number, d: number) => weekDay(y, m, d, 6);
export const sun = (y: number, m: number, d: number) => weekDay(y, m, d, 0);
export const wed = (y: number, m: number, d: number) => weekDay(y, m, d, 3);
export const tue = (y: number, m: number, d: number) => weekDay(y, m, d, 2);
export const thu = (y: number, m: number, d: number) => weekDay(y, m, d, 4);

export interface SeasonCalendar {
  year: number;
  seasonStart: number;      // 1 July
  seasonEnd: number;        // 30 June next year
  preseasonEnd: number;
  transferWindows: [number, number][];
  intlBreakWeeks: number[]; // Monday day indices of international-break weeks
  winterBreak: Record<string, [number, number]>; // nation -> [from, to] inclusive days without league
  leagueStart: Record<string, number>;
  leagueEnd: Record<string, number>;
  leagueMidweeks: Record<string, number[]>; // designated midweek league rounds
  extraLeagueDays: Record<string, number[]>; // e.g. Boxing Day
  ucl: { md: number[]; po: [number, number]; r16: [number, number]; qf: [number, number]; sf: [number, number]; final: number };
  uel: { md: number[]; po: [number, number]; r16: [number, number]; qf: [number, number]; sf: [number, number]; final: number };
  uecl: { md: number[]; po: [number, number]; r16: [number, number]; qf: [number, number]; sf: [number, number]; final: number };
  uefaSuperCup: number;
  cups: Record<string, number[]>; // cup id -> stage days (first legs); second legs are computed
  cups2: Record<string, (number | null)[]>; // second-leg days where applicable
  supercups: Record<string, number[]>;
  busyDays: Set<number>; // days with international matches (no club football)
}

export function buildCalendar(year: number): SeasonCalendar {
  const Y = year, Y1 = year + 1;
  const intlWeeks = [sat(Y, 9, 5), sat(Y, 10, 10), sat(Y, 11, 14), sat(Y1, 3, 27)].map((s) => s - 5); // Mondays
  const busy = new Set<number>();
  for (const mon of intlWeeks) for (let d = mon; d < mon + 7; d++) busy.add(d);

  const cal: SeasonCalendar = {
    year: Y,
    seasonStart: dateToDay(Y, 7, 1),
    seasonEnd: dateToDay(Y1, 6, 30),
    preseasonEnd: sat(Y, 8, 15) - 1,
    transferWindows: [[dateToDay(Y, 7, 1), dateToDay(Y, 9, 1)], [dateToDay(Y1, 1, 1), dateToDay(Y1, 2, 2)]],
    intlBreakWeeks: intlWeeks,
    winterBreak: {
      ENG: [dateToDay(Y, 12, 31), dateToDay(Y, 12, 31)],
      ESP: [dateToDay(Y, 12, 22), dateToDay(Y1, 1, 1)],
      GER: [dateToDay(Y, 12, 22), dateToDay(Y1, 1, 7)],
      ITA: [dateToDay(Y, 12, 29), dateToDay(Y1, 1, 1)],
      FRA: [dateToDay(Y, 12, 22), dateToDay(Y1, 1, 1)],
    },
    leagueStart: { ENG1: sat(Y, 8, 15), ESP1: sat(Y, 8, 15), GER1: sat(Y, 8, 22), ITA1: sat(Y, 8, 22), FRA1: sat(Y, 8, 15) },
    leagueEnd: { ENG1: sun(Y1, 5, 22), ESP1: sun(Y1, 5, 22), GER1: sat(Y1, 5, 15), ITA1: sun(Y1, 5, 22), FRA1: sat(Y1, 5, 15) },
    leagueMidweeks: {
      ENG1: [wed(Y, 9, 9), wed(Y, 12, 30), wed(Y1, 3, 31)],
      ESP1: [wed(Y, 9, 9), wed(Y1, 3, 31)],
      GER1: [wed(Y, 9, 9), wed(Y1, 3, 31)],
      ITA1: [wed(Y, 9, 9), wed(Y, 10, 14), wed(Y1, 3, 31)],
      FRA1: [wed(Y, 9, 9)],
    },
    extraLeagueDays: { ENG1: [dateToDay(Y, 12, 26)] },
    ucl: {
      md: [wed(Y, 9, 16), wed(Y, 9, 30), wed(Y, 10, 21), wed(Y, 11, 4), wed(Y, 11, 25), wed(Y, 12, 9), wed(Y1, 1, 20), wed(Y1, 1, 27)],
      po: [wed(Y1, 2, 17), wed(Y1, 2, 24)], r16: [wed(Y1, 3, 10), wed(Y1, 3, 17)], qf: [wed(Y1, 4, 7), wed(Y1, 4, 14)], sf: [wed(Y1, 4, 28), wed(Y1, 5, 5)], final: sat(Y1, 5, 29),
    },
    uel: {
      md: [thu(Y, 9, 16), thu(Y, 9, 30), thu(Y, 10, 21), thu(Y, 11, 4), thu(Y, 11, 25), thu(Y, 12, 9), thu(Y1, 1, 20), thu(Y1, 1, 27)],
      po: [thu(Y1, 2, 17), thu(Y1, 2, 24)], r16: [thu(Y1, 3, 10), thu(Y1, 3, 17)], qf: [thu(Y1, 4, 7), thu(Y1, 4, 14)], sf: [thu(Y1, 4, 28), thu(Y1, 5, 5)], final: wed(Y1, 5, 26),
    },
    uecl: {
      md: [thu(Y, 10, 1), thu(Y, 10, 22), thu(Y, 11, 5), thu(Y, 11, 26), thu(Y, 12, 10), thu(Y, 12, 17)],
      po: [thu(Y1, 2, 17), thu(Y1, 2, 24)], r16: [thu(Y1, 3, 10), thu(Y1, 3, 17)], qf: [thu(Y1, 4, 7), thu(Y1, 4, 14)], sf: [thu(Y1, 4, 28), thu(Y1, 5, 5)], final: wed(Y1, 6, 2),
    },
    uefaSuperCup: wed(Y, 8, 12),
    cups: {
      // England
      ENG_FAC: [sat(Y1, 1, 9), sat(Y1, 1, 30), wed(Y1, 3, 3), sat(Y1, 4, 3), sat(Y1, 4, 24), sat(Y1, 5, 15)],
      ENG_EFL: [wed(Y, 8, 26), wed(Y, 9, 23), wed(Y, 10, 28), wed(Y, 12, 16), wed(Y1, 1, 6), sun(Y1, 2, 28)],
      // Spain
      ESP_CDR: [wed(Y, 10, 28), wed(Y, 12, 2), wed(Y1, 1, 6), wed(Y1, 1, 13), wed(Y1, 2, 3), wed(Y1, 3, 3), sat(Y1, 5, 1)],
      // Germany
      GER_POK: [wed(Y, 8, 19), wed(Y, 10, 28), wed(Y, 12, 2), wed(Y1, 2, 10), wed(Y1, 4, 21), sat(Y1, 5, 22)],
      // Italy
      ITA_CIT: [wed(Y, 8, 26), wed(Y, 9, 23), wed(Y, 12, 2), wed(Y1, 1, 13), wed(Y1, 3, 3), wed(Y1, 5, 12)],
      // France
      FRA_CDF: [wed(Y, 12, 16), wed(Y1, 1, 13), wed(Y1, 2, 10), wed(Y1, 3, 3), wed(Y1, 4, 21), sat(Y1, 5, 8)],
    },
    cups2: {
      ENG_FAC: [null, null, null, null, null, null],
      ENG_EFL: [null, null, null, null, wed(Y1, 2, 3), null],
      ESP_CDR: [null, null, null, null, null, wed(Y1, 4, 21), null],
      GER_POK: [null, null, null, null, null, null],
      ITA_CIT: [null, null, null, null, wed(Y1, 4, 21), null],
      FRA_CDF: [null, null, null, null, null, null],
    },
    supercups: {
      ENG_CS: [sun(Y, 8, 9)],
      GER_SC: [sat(Y, 8, 8)],
      ESP_SC: [wed(Y1, 1, 6), sun(Y1, 1, 10)],
      ITA_SC: [wed(Y1, 1, 6), sun(Y1, 1, 10)],
      FRA_TC: [wed(Y1, 1, 6)],
    },
    busyDays: busy,
  };
  return cal;
}

/** Saturday slots available for a league in a season */
export function leagueWeekendSlots(cal: SeasonCalendar, leagueId: string, nation: string): number[] {
  const slots: number[] = [];
  const start = cal.leagueStart[leagueId], end = cal.leagueEnd[leagueId];
  const wb = cal.winterBreak[nation];
  const faWeekends = nation === 'ENG' ? [cal.cups.ENG_FAC[0], cal.cups.ENG_FAC[1]] : [];
  for (let d = start; d <= end; d++) {
    if (dayOfWeek(d) !== 6) continue;
    if (cal.busyDays.has(d)) continue;
    if (wb && d >= wb[0] && d <= wb[1]) continue;
    if (faWeekends.includes(d)) continue;
    slots.push(d);
  }
  for (const d of cal.extraLeagueDays[leagueId] ?? []) if (!slots.includes(d)) slots.push(d);
  return slots.sort((a, b) => a - b);
}
