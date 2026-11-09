import { daysBetween, fromUTC, isISODate, toUTC, todayISO, type ISODate } from "../training/dates";
import type { AthleteSlug } from "../training/types";

/**
 * Pure validation and calendar helpers shared by the MCP tools. Nothing here
 * touches the database or Next, so tests import it directly.
 */

/** The athlete lives and trains on US Eastern time. */
export const ATHLETE_TIME_ZONE = "America/New_York";

/**
 * The only athlete the site tracks. Typed as AthleteSlug so this compiles
 * whether that type is just "filippo" or still a union.
 */
export const ATHLETE: AthleteSlug = "filippo";

/**
 * A failure the caller (the LLM) can act on. Tools turn it into an MCP error
 * result with this message; anything else is reported as an internal error.
 */
export class McpToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpToolError";
  }
}

/** YYYY-MM-DD that is also a real calendar day (rejects 2026-02-30). */
export function isRealDate(value: unknown): value is ISODate {
  if (!isISODate(value)) return false;
  return fromUTC(toUTC(value)) === value;
}

export function assertDate(value: unknown, label: string): ISODate {
  if (!isRealDate(value)) throw new McpToolError(`${label} "${String(value)}" must be a real date written YYYY-MM-DD.`);
  return value;
}

/**
 * Validate an inclusive date range: both ends real dates, `from` not after
 * `to`, and at most `maxDays` days long (counting both ends).
 */
export function validateRange(from: unknown, to: unknown, maxDays: number): { from: ISODate; to: ISODate; days: number } {
  const f = assertDate(from, "from");
  const t = assertDate(to, "to");
  const days = daysBetween(f, t) + 1;
  if (days < 1) throw new McpToolError(`from (${f}) must be on or before to (${t}).`);
  if (days > maxDays) throw new McpToolError(`The range ${f} to ${t} spans ${days} days; the limit for this tool is ${maxDays}. Split it into smaller calls.`);
  return { from: f, to: t, days };
}

/** Day 1 of the training window. */
export const TRAINING_START_DATE: ISODate = "2026-11-02";

/** Race day: IRONMAN 70.3 Texas, the last day of the window. */
export const RACE_DAY: ISODate = "2027-04-04";

/**
 * Where `today` sits in the training window: day 1 is TRAINING_START_DATE
 * and the last day is RACE_DAY. `day_number` is null outside the window.
 */
export function trainingWindow(today: ISODate) {
  const totalDays = daysBetween(TRAINING_START_DATE, RACE_DAY) + 1;
  const n = daysBetween(TRAINING_START_DATE, today) + 1;
  const daysToRace = daysBetween(today, RACE_DAY);
  let status: string;
  if (n < 1) status = `Before training: day 1 is ${TRAINING_START_DATE}.`;
  else if (daysToRace === 0) status = `Race day (day ${n} of ${totalDays}).`;
  else if (daysToRace < 0) status = "After race day.";
  else status = `Day ${n} of ${totalDays}, ${daysToRace} days to race day.`;
  return {
    start: TRAINING_START_DATE,
    race_day: RACE_DAY,
    total_days: totalDays,
    day_number: n >= 1 && n <= totalDays ? n : null,
    days_to_race: daysToRace,
    status,
  };
}

/** Today in the athletes' time zone. */
export function todayForAthletes(now = new Date()): ISODate {
  return todayISO(ATHLETE_TIME_ZONE, now);
}

/** "+HH:MM" / "-HH:MM" UTC offset of `timeZone` at the given instant. */
export function utcOffset(timeZone: string, at: Date): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  // "GMT-05:00", or plain "GMT" for UTC itself.
  const m = part ? /GMT([+-]\d{2}):?(\d{2})?/.exec(part) : null;
  if (!m) return "+00:00";
  return `${m[1]}:${m[2] ?? "00"}`;
}

/** HH:MM (24 h) check. */
export function isClock(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * ISO 8601 local start with offset, the shape Strava rows use, for a wall
 * clock time on `date` in `timeZone`. The offset is taken at noon UTC of that
 * day, which is right for every hour except the DST switch itself.
 */
export function localStart(date: ISODate, clock: string, timeZone = ATHLETE_TIME_ZONE): string {
  if (!isClock(clock)) throw new McpToolError(`start_time "${clock}" must be HH:MM (24 hour).`);
  const offset = utcOffset(timeZone, new Date(`${date}T12:00:00Z`));
  return `${date}T${clock}:00${offset}`;
}
