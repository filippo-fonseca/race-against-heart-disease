import type { ISODate } from "../training/dates";
import type { Activity, AthleteSlug, Sport } from "../training/types";
import { assertDate, ATHLETE_TIME_ZONE, localStart, McpToolError, type AthleteChoice } from "./validate";

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

/* ------------------------------------------------------------------ */
/* Building and patching manual rows                                    */
/* ------------------------------------------------------------------ */

/** The Strava sport_type a manual row carries, so the UI labels it like a synced one. */
export const SPORT_TYPE_FOR: Record<Sport, string> = {
  swim: "Swim",
  bike: "Ride",
  run: "Run",
  strength: "WeightTraining",
  other: "Workout",
};

const DEFAULT_NAME: Record<Sport, string> = {
  swim: "Swim",
  bike: "Ride",
  run: "Run",
  strength: "Strength",
  other: "Workout",
};

/** Start time used when the caller does not give one (noon keeps the date safe in any zone). */
export const DEFAULT_START = "12:00";

/** Metric fields shared by log_activities and update_activity. */
export interface ActivityMetrics {
  moving_time_min?: number | null;
  elapsed_time_min?: number | null;
  distance_km?: number | null;
  elevation_m?: number | null;
  avg_hr?: number | null;
  max_hr?: number | null;
  avg_watts?: number | null;
}

export interface ManualActivityInput extends ActivityMetrics {
  athlete: AthleteChoice;
  sport: Sport;
  date: string;
  start_time?: string | null;
  name?: string | null;
  description?: string | null;
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function checkMetrics(m: ActivityMetrics, where: string): void {
  const inRange = (v: number | null | undefined, label: string, max: number) => {
    if (v === null || v === undefined) return;
    if (!Number.isFinite(v) || v < 0 || v > max) throw new McpToolError(`${where}.${label} must be between 0 and ${max}.`);
  };
  inRange(m.moving_time_min, "moving_time_min", 1440);
  inRange(m.elapsed_time_min, "elapsed_time_min", 1440);
  inRange(m.distance_km, "distance_km", 1000);
  inRange(m.elevation_m, "elevation_m", 10000);
  inRange(m.avg_hr, "avg_hr", 250);
  inRange(m.max_hr, "max_hr", 250);
  inRange(m.avg_watts, "avg_watts", 2000);
}

/**
 * A manual activity row for one athlete. Requires moving_time_min (the log
 * and every total are time based); everything else is optional and stays
 * null or zero rather than guessed. Dates after `today` are refused.
 */
export function buildManualActivity(
  input: ManualActivityInput,
  opts: { id: number; athlete: AthleteSlug; today: ISODate; index: number },
): Activity {
  const where = `activities[${opts.index}]`;
  const date = assertDate(input.date, `${where}.date`);
  if (date > opts.today) {
    throw new McpToolError(`${where}.date ${date} is in the future (today is ${opts.today}). Log sessions after they happen; plan future ones with the plan tools.`);
  }
  checkMetrics(input, where);
  const moving = input.moving_time_min;
  if (moving === null || moving === undefined || moving <= 0) {
    throw new McpToolError(`${where}.moving_time_min is required: ask how long the session was instead of guessing.`);
  }
  const elapsed = input.elapsed_time_min ?? moving;
  return {
    id: String(opts.id),
    athlete: opts.athlete,
    sport: input.sport,
    stravaSportType: SPORT_TYPE_FOR[input.sport],
    name: (input.name ?? "").trim() || DEFAULT_NAME[input.sport],
    description: (input.description ?? "").trim() || null,
    startLocal: localStart(date, input.start_time ?? DEFAULT_START),
    date,
    movingTimeSec: Math.round(moving * 60),
    elapsedTimeSec: Math.round(Math.max(elapsed, moving) * 60),
    distanceM: Math.round((input.distance_km ?? 0) * 1000),
    elevationGainM: Math.round(input.elevation_m ?? 0),
    avgHr: input.avg_hr ?? null,
    maxHr: input.max_hr ?? null,
    avgWatts: input.avg_watts ?? null,
    effort: null,
    photos: [],
    detailed: true,
  };
}

/** Fields update_activity may change. `null` clears a nullable field. */
export interface ActivityPatchInput extends ActivityMetrics {
  name?: string | null;
  description?: string | null;
  sport?: Sport | null;
  date?: string | null;
  start_time?: string | null;
}

/** Column patch for `training.activities`. */
export interface ActivityColumnPatch {
  name?: string;
  description?: string | null;
  sport?: Sport;
  strava_sport_type?: string;
  date?: string;
  start_local?: string;
  moving_time_sec?: number;
  elapsed_time_sec?: number;
  distance_m?: number;
  elevation_gain_m?: number;
  avg_hr?: number | null;
  max_hr?: number | null;
  avg_watts?: number | null;
}

/** HH:MM wall clock of an ISO instant in `timeZone`. */
export function localClock(iso: string, timeZone = ATHLETE_TIME_ZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DEFAULT_START;
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/**
 * Turn an update_activity request into a column patch against `current`.
 * Changing the date or start time rewrites start_local in the athletes'
 * zone (keeping whichever of the two was not given). Changing the sport of a
 * manual row also updates its sport_type label. Throws on an empty patch.
 */
export function activityPatch(current: Activity, fields: ActivityPatchInput, today: ISODate): ActivityColumnPatch {
  const patch: ActivityColumnPatch = {};
  checkMetrics(fields, "fields");
  if (fields.name !== undefined && fields.name !== null) {
    const name = fields.name.trim();
    if (name.length === 0) throw new McpToolError("fields.name cannot be empty.");
    patch.name = name;
  }
  if (fields.description !== undefined) patch.description = (fields.description ?? "").trim() || null;
  if (fields.sport) {
    patch.sport = fields.sport;
    if (isManualId(current.id)) patch.strava_sport_type = SPORT_TYPE_FOR[fields.sport];
  }
  if (fields.date || fields.start_time) {
    const date = fields.date ? assertDate(fields.date, "fields.date") : current.date;
    if (date > today) throw new McpToolError(`fields.date ${date} is in the future (today is ${today}).`);
    const clock = fields.start_time ?? localClock(current.startLocal);
    patch.date = date;
    patch.start_local = localStart(date, clock);
  }
  if (fields.moving_time_min != null) patch.moving_time_sec = Math.round(fields.moving_time_min * 60);
  if (fields.elapsed_time_min != null) patch.elapsed_time_sec = Math.round(fields.elapsed_time_min * 60);
  if (fields.distance_km != null) patch.distance_m = Math.round(fields.distance_km * 1000);
  if (fields.elevation_m != null) patch.elevation_gain_m = Math.round(fields.elevation_m);
  if (fields.avg_hr !== undefined) patch.avg_hr = fields.avg_hr;
  if (fields.max_hr !== undefined) patch.max_hr = fields.max_hr;
  if (fields.avg_watts !== undefined) patch.avg_watts = fields.avg_watts;
  if (Object.keys(patch).length === 0) throw new McpToolError("fields is empty: nothing to update.");
  return patch;
}

/** Snake-case, LLM-friendly view of an activity. */
export function compactActivity(a: Activity) {
  return {
    id: a.id,
    source: sourceOf(a.id),
    athlete: a.athlete,
    sport: a.sport,
    sport_type: a.stravaSportType,
    name: a.name,
    date: a.date,
    start_local: a.startLocal,
    moving_time_min: round(a.movingTimeSec / 60, 1),
    elapsed_time_min: round(a.elapsedTimeSec / 60, 1),
    distance_km: round(a.distanceM / 1000, 2),
    elevation_m: Math.round(a.elevationGainM),
    avg_hr: a.avgHr,
    max_hr: a.maxHr,
    avg_watts: a.avgWatts,
    effort: a.effort,
    description: a.description,
    photos: a.photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption })),
  };
}
