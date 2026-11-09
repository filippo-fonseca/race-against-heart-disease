/**
 * Pure helpers for activities logged through MCP (sessions that are not on
 * Strava). No database, no Next: tests import this directly.
 *
 * Manual rows live in `training.activities` next to Strava rows. Strava ids
 * are positive, so manual rows get negative ids: they can never collide, the
 * Strava sync never lists them (it only fetches ids Strava returns), and
 * `id < 0` is how every reader tells the two apart without a new column.
 */

/** Whether an activity id belongs to a manually logged session. */
export function isManualId(id: number | string): boolean {
  return Number(id) < 0;
}

export type ActivitySource = "manual" | "strava";

export function sourceOf(id: number | string): ActivitySource {
  return isManualId(id) ? "manual" : "strava";
}

/**
 * A fresh negative id: milliseconds since the epoch times 1000 plus three
 * random digits, negated. Stays inside Number.MAX_SAFE_INTEGER until the
 * year 2255 and inside Postgres bigint forever; two ids collide only when
 * minted in the same millisecond with the same random suffix.
 */
export function manualActivityId(now: number = Date.now(), random: number = Math.random()): number {
  const suffix = Math.min(999, Math.max(0, Math.floor(random * 1000)));
  return -(Math.floor(now) * 1000 + suffix);
}
