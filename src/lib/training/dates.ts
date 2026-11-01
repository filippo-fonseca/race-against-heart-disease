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
