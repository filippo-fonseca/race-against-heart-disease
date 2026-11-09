import { daysBetween, fromUTC, isISODate, toUTC, todayISO, type ISODate } from "../training/dates";
import type { AthleteSlug } from "../training/types";

/**
 * Pure validation and calendar helpers shared by the MCP tools. Nothing here
 * touches the database or Next, so tests import it directly.
 */

/** The athletes live and train on US Eastern time. */
export const ATHLETE_TIME_ZONE = "America/New_York";

export const ATHLETE_SLUGS: readonly AthleteSlug[] = ["filippo", "emir"];

/** `filippo`, `emir`, or `both` (the tool-level athlete selector). */
export type AthleteChoice = AthleteSlug | "both";

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

/** `both` (or nothing) means every athlete; otherwise the one slug. */
export function athletesFor(choice: AthleteChoice | undefined | null): AthleteSlug[] {
  if (!choice || choice === "both") return [...ATHLETE_SLUGS];
  return [choice];
}

/** Plan-row `athletes` value for a choice: empty means everyone. */
export function planAthletes(choice: AthleteChoice | undefined | null): AthleteSlug[] {
  if (!choice || choice === "both") return [];
  return [choice];
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
