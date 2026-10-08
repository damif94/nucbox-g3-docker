// Business days for a U.S. bank: weekdays minus Federal Reserve holidays. The exports have
// no snapshot on those days (Labor Day 2026-09-07 is the gap in the first upload), so they
// are "closed", not "missing". Dates are ISO strings handled in UTC.

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(s + 'T00:00:00Z');

export const addDays = (s: string, n: number) => {
  const d = utc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

const isWeekend = (s: string) => {
  const w = utc(s).getUTCDay();
  return w === 0 || w === 6;
};

/** n-th (1-based; -1 = last) given weekday (0 = Sunday) of a month */
function nth(year: number, month: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    return iso(new Date(Date.UTC(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7)));
  }
  const last = new Date(Date.UTC(year, month + 1, 0));
  return iso(new Date(Date.UTC(year, month, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7))));
}

const cache = new Map<number, Set<string>>();
function holidays(year: number): Set<string> {
  let h = cache.get(year);
  if (h) return h;
  // fixed dates falling on a Sunday are observed on Monday (the Fed does not close on the Friday before a Saturday)
  const fixed = (m: number, d: number) => {
    const s = iso(new Date(Date.UTC(year, m, d)));
    return utc(s).getUTCDay() === 0 ? addDays(s, 1) : s;
  };
  h = new Set([
    fixed(0, 1), // New Year's Day
    nth(year, 0, 1, 3), // Martin Luther King Jr. Day
    nth(year, 1, 1, 3), // Washington's Birthday
    nth(year, 4, 1, -1), // Memorial Day
    fixed(5, 19), // Juneteenth
    fixed(6, 4), // Independence Day
    nth(year, 8, 1, 1), // Labor Day
    nth(year, 9, 1, 2), // Columbus Day
    fixed(10, 11), // Veterans Day
    nth(year, 10, 4, 4), // Thanksgiving
    fixed(11, 25), // Christmas
  ]);
  cache.set(year, h);
  return h;
}

export const isHoliday = (s: string) => holidays(+s.slice(0, 4)).has(s);
export const isBusinessDay = (s: string) => !isWeekend(s) && !isHoliday(s);

/** every weekday from..to inclusive (holidays included, so they can be shown as closed) */
export function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (!isWeekend(d)) out.push(d);
  return out;
}

export const businessDaysBetween = (from: string, to: string) => weekdays(from, to).filter((d) => !isHoliday(d));
