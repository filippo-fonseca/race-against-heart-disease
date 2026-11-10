/**
 * Calendar helpers that operate on YYYY-MM-DD strings only. Nothing here
 * touches local time: every string is interpreted as a UTC date, so the
 * results are identical on the server, in the browser, and in tests.
 */

export type ISODate = string;

const DAY_MS = 86_400_000;

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export function isISODate(value: unknown): value is ISODate {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function toUTC(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(new Date(toUTC(date).getTime() + days * DAY_MS));
}

/** Whole days from `a` to `b`; positive when `b` is later. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / DAY_MS);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(date: ISODate): number {
  return (toUTC(date).getUTCDay() + 6) % 7;
}

export function weekday(date: ISODate): Weekday {
  return WEEKDAYS[weekdayIndex(date)];
}

/** Monday of the week containing `date`. */
export function weekStartOf(date: ISODate): ISODate {
  return addDays(date, -weekdayIndex(date));
}

/** Every date from `from` to `to`, inclusive. Empty when `to` < `from`. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const n = daysBetween(from, to);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}

/** Today as YYYY-MM-DD in the given IANA zone (defaults to race-local time). */
export function todayISO(timeZone = "America/Chicago", now = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/* ------------------------------------------------------------------ */
/* The training window                                                 */
/* ------------------------------------------------------------------ */

/** Day 1 of training, a Monday. */
export const TRAINING_START: ISODate = "2026-11-02";

/** Race day (site.race.date, in race-local time) and the last day of the window. */
export const RACE_DAY: ISODate = "2027-04-04";

/** Days in the window, both ends included: 154. */
export const TRAINING_DAYS = daysBetween(TRAINING_START, RACE_DAY) + 1;

/** Monday-start weeks in the window: 22, the last ending on race day. */
export const TRAINING_WEEKS = Math.ceil(TRAINING_DAYS / 7);

/** Day number in the window: November 2 is day 1, race day is day 154. */
export function dayNumber(date: ISODate): number {
  return daysBetween(TRAINING_START, date) + 1;
}

/**
 * Weeks of training elapsed by `today`, for per-week averages. Counts days
 * in the window so far (today included) over 7, floored at one week so the
 * first few days do not inflate the average. 0 before day 1, capped at race day.
 */
export function weeksElapsed(today: ISODate): number {
  const days = Math.min(dayNumber(today), TRAINING_DAYS);
  if (days <= 0) return 0;
  return Math.max(days, 7) / 7;
}

/** Week number in the window: week 1 starts on TRAINING_START. Below 1 before, above 22 after. */
export function weekNumber(date: ISODate): number {
  return Math.floor(daysBetween(TRAINING_START, weekStartOf(date)) / 7) + 1;
}

/** Monday of a given window week. */
export function weekStartFor(week: number): ISODate {
  return addDays(TRAINING_START, (week - 1) * 7);
}

/** Whole days until race day from `today`; negative after the race. */
export function daysToRace(today: ISODate): number {
  return daysBetween(today, RACE_DAY);
}

/** Whether a date falls inside the window. */
export function inWindow(date: ISODate): boolean {
  return date >= TRAINING_START && date <= RACE_DAY;
}
