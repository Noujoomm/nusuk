/**
 * Time helpers for the dashboard's daily-tracks ranking. Everything is
 * pinned to Asia/Riyadh; KSA never observes DST so the offset is a fixed
 * +3h and we don't need a tz library.
 */

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * UTC instant corresponding to today's 00:00 in Asia/Riyadh.
 */
export function startOfDayInRiyadh(now: Date): Date {
  const ms = Math.floor((now.getTime() + RIYADH_OFFSET_MS) / DAY_MS) * DAY_MS;
  return new Date(ms - RIYADH_OFFSET_MS);
}

/**
 * "YYYY-MM-DD" of the Riyadh calendar date that the given UTC instant
 * falls in. Useful as a stable key for the snapshot table.
 */
export function riyadhDateString(d: Date): string {
  return new Date(d.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Translates a Riyadh calendar date ("YYYY-MM-DD") into the UTC range
 * [start, end) covering that full Riyadh day, plus the bare `Date`-only
 * value to write into a `@db.Date` column.
 */
export function riyadhDateBoundaries(yyyyMmDd: string): {
  start: Date;
  end: Date;
  date: Date;
} {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !m || !d) {
    throw new Error(`Invalid Riyadh date: ${yyyyMmDd} (expected YYYY-MM-DD)`);
  }
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0) - RIYADH_OFFSET_MS;
  return {
    start: new Date(startMs),
    end: new Date(startMs + DAY_MS),
    date: new Date(Date.UTC(y, m - 1, d)),
  };
}

/**
 * Subtract `days` from a Riyadh date string, returning a new "YYYY-MM-DD".
 */
export function addDaysRiyadh(yyyyMmDd: string, days: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) + days * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}
