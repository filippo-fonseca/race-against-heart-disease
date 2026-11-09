import type { ISODate } from "../training/dates";
import type { CreateActivityInput, UpdateActivityInput } from "../training/strava";
import type { Activity, AthleteSlug } from "../training/types";
import { assertDate, isClock, McpToolError, type AthleteChoice } from "./validate";

/**
 * Pure helpers for the activity tools. No database, no Next, no network:
 * tests import this directly.
 *
 * Strava is the only source of activities. log_activities and
 * update_activity turn the bot's request into Strava API payloads here; the
 * tools then call Strava and pull the result back into the Supabase mirror.
 * Nothing in this module produces a mirror row on its own.
 */

/**
 * The four buckets the site reports: swim, bike, run, and strength (shown
 * as LIFT), which covers HIIT, weights and anything that is not one of the
 * other three. Defined here rather than taken from types.ts so the tools do
 * not depend on how many values `Sport` has.
 */
export const SPORT_BUCKETS = ["swim", "bike", "run", "strength"] as const;
export type SportBucket = (typeof SPORT_BUCKETS)[number];

export const BUCKET_LABEL: Record<SportBucket, string> = { swim: "SWIM", bike: "BIKE", run: "RUN", strength: "LIFT" };

/** Bucket of a stored activity's `sport` (anything but swim, bike or run is strength). */
export function bucketOf(sport: string | null | undefined): SportBucket {
  return sport === "swim" || sport === "bike" || sport === "run" ? sport : "strength";
}

export interface TotalsRow {
  sport: string | null;
  moving_time_sec: number | null;
  distance_m: number | string | null;
}

export interface BucketTotals {
  label: string;
  sessions: number;
  hours: number;
  km: number;
}

/** Sessions, hours and km per bucket (every bucket present, zeros included). */
export function sportTotals(rows: TotalsRow[]): Record<SportBucket, BucketTotals> {
  const acc = Object.fromEntries(SPORT_BUCKETS.map((b) => [b, { sec: 0, m: 0, n: 0 }])) as Record<SportBucket, { sec: number; m: number; n: number }>;
  for (const r of rows) {
    const t = acc[bucketOf(r.sport)];
    t.n += 1;
    t.sec += r.moving_time_sec ?? 0;
    t.m += Number(r.distance_m ?? 0) || 0;
  }
  return Object.fromEntries(
    SPORT_BUCKETS.map((b) => [b, { label: BUCKET_LABEL[b], sessions: acc[b].n, hours: round(acc[b].sec / 3600, 1), km: round(acc[b].m / 1000, 1) }]),
  ) as Record<SportBucket, BucketTotals>;
}

/**
 * The Strava sport_type sent for each bucket when the caller gives none.
 * Strength defaults to HIIT, the usual session; the bot passes an explicit
 * sport_type (WeightTraining, Crossfit, Yoga...) when the athlete says so.
 * An indoor ride is a Ride with trainer set (or an explicit VirtualRide).
 */
export const SPORT_TYPE_FOR: Record<SportBucket, string> = {
  swim: "Swim",
  bike: "Ride",
  run: "Run",
  strength: "HighIntensityIntervalTraining",
};

const DEFAULT_NAME: Record<SportBucket, string> = {
  swim: "Swim",
  bike: "Ride",
  run: "Run",
  strength: "Lift",
};

/** Start time used when the caller does not give one (noon keeps the date safe in any zone). */
export const DEFAULT_START = "12:00";

/** Strava SportType names are single CamelCase words ("VirtualRide", "TrailRun"). */
const SPORT_TYPE_RE = /^[A-Z][A-Za-z]{1,39}$/;

function checkSportType(value: string, where: string): string {
  const v = value.trim();
  if (!SPORT_TYPE_RE.test(v)) throw new McpToolError(`${where} "${value}" is not a Strava sport type (one CamelCase word, e.g. VirtualRide, TrailRun, Yoga).`);
  return v;
}

/** One session for log_activities, as the bot sends it. */
export interface LogActivityInput {
  athlete: AthleteChoice;
  sport: SportBucket;
  /** Overrides the bucket's default, e.g. "VirtualRide" or "WeightTraining". */
  sport_type?: string | null;
  date: string;
  start_time?: string | null;
  name?: string | null;
  description?: string | null;
  /** Total minutes; Strava stores it as elapsed (and moving) time. */
  duration_min: number;
  distance_km?: number | null;
  trainer?: boolean | null;
  commute?: boolean | null;
}

/**
 * The `POST /activities` payload for one session. Refuses future dates and
 * missing or silly durations; distance stays off unless the athlete gave it.
 * `start_date_local` is wall-clock time without an offset: Strava reads it
 * in the athlete's own time zone, which is what the bot was told.
 */
export function buildStravaCreate(input: LogActivityInput, opts: { today: ISODate; index: number }): CreateActivityInput {
  const where = `activities[${opts.index}]`;
  const date = assertDate(input.date, `${where}.date`);
  if (date > opts.today) {
    throw new McpToolError(`${where}.date ${date} is in the future (today is ${opts.today}). Log sessions only after they happen.`);
  }
  const minutes = input.duration_min;
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) {
    throw new McpToolError(`${where}.duration_min is required (minutes, 1 to 1440): ask how long the session was instead of guessing.`);
  }
  const km = input.distance_km;
  if (km != null && (!Number.isFinite(km) || km < 0 || km > 1000)) throw new McpToolError(`${where}.distance_km must be between 0 and 1000.`);
  const clock = input.start_time ?? DEFAULT_START;
  if (!isClock(clock)) throw new McpToolError(`${where}.start_time "${clock}" must be HH:MM (24 hour).`);

  if (!(SPORT_BUCKETS as readonly string[]).includes(input.sport)) {
    throw new McpToolError(`${where}.sport "${String(input.sport)}" must be swim, bike, run or strength.`);
  }
  const fallbackName = input.sport === "bike" && input.trainer ? "Indoor ride" : DEFAULT_NAME[input.sport];
  const payload: CreateActivityInput = {
    name: (input.name ?? "").trim() || fallbackName,
    sport_type: input.sport_type ? checkSportType(input.sport_type, `${where}.sport_type`) : SPORT_TYPE_FOR[input.sport],
    start_date_local: `${date}T${clock}:00`,
    elapsed_time: Math.round(minutes * 60),
  };
  const description = (input.description ?? "").trim();
  if (description) payload.description = description;
  if (km != null && km > 0) payload.distance = Math.round(km * 1000);
  if (input.trainer != null) payload.trainer = input.trainer;
  if (input.commute != null) payload.commute = input.commute;
  return payload;
}

/** Fields update_activity may change: exactly what Strava's API can update. */
export interface ActivityUpdateFields {
  name?: string | null;
  /** null or "" clears it. */
  description?: string | null;
  sport?: SportBucket | null;
  sport_type?: string | null;
  trainer?: boolean | null;
  commute?: boolean | null;
  hide_from_home?: boolean | null;
}

/**
 * The `PUT /activities/{id}` payload for an update_activity request. A sport
 * change only sends a new sport_type when the bucket really changes, so
 * "bike" on a VirtualRide keeps it virtual and "strength" on WeightTraining
 * keeps it weights. Throws on an empty patch.
 */
export function buildStravaUpdate(current: Pick<Activity, "sport" | "stravaSportType">, fields: ActivityUpdateFields): UpdateActivityInput {
  const patch: UpdateActivityInput = {};
  if (fields.name !== undefined && fields.name !== null) {
    const name = fields.name.trim();
    if (name.length === 0) throw new McpToolError("fields.name cannot be empty.");
    patch.name = name;
  }
  if (fields.description !== undefined) patch.description = (fields.description ?? "").trim();
  if (fields.sport_type) {
    patch.sport_type = checkSportType(fields.sport_type, "fields.sport_type");
  } else if (fields.sport && fields.sport !== bucketOf(current.sport)) {
    patch.sport_type = SPORT_TYPE_FOR[fields.sport];
  }
  if (patch.sport_type === current.stravaSportType) delete patch.sport_type;
  if (fields.trainer != null) patch.trainer = fields.trainer;
  if (fields.commute != null) patch.commute = fields.commute;
  if (fields.hide_from_home != null) patch.hide_from_home = fields.hide_from_home;
  if (Object.keys(patch).length === 0) throw new McpToolError("fields is empty (or matches the activity already): nothing to update.");
  return patch;
}

/** One Strava create the bulk loop will attempt. */
export interface PlannedCreate {
  index: number;
  athlete: AthleteSlug;
  payload: CreateActivityInput;
}

export interface SequentialResult<R> {
  done: R[];
  /** Items never attempted (rate limit) or after the failing one. */
  remaining: PlannedCreate[];
  stopped: null | { reason: "rate_limit" | "error"; message: string; item?: PlannedCreate };
}

/**
 * Run creates one at a time. Before each one, stop if Strava's rate limit is
 * close; on the first failure, stop too (the next calls would most likely
 * fail the same way, and a half-applied batch is easier to report than to
 * untangle). Strava activities cannot be deleted through the API, so nothing
 * is retried blindly.
 */
export async function createSequentially<R>(
  items: PlannedCreate[],
  deps: { create: (item: PlannedCreate) => Promise<R>; nearLimit: () => boolean },
): Promise<SequentialResult<R>> {
  const done: R[] = [];
  for (let i = 0; i < items.length; i++) {
    if (deps.nearLimit()) {
      return { done, remaining: items.slice(i), stopped: { reason: "rate_limit", message: "Strava's rate limit is nearly used up; try the remaining sessions again in 15 minutes." } };
    }
    try {
      done.push(await deps.create(items[i]));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { done, remaining: items.slice(i), stopped: { reason: "error", message, item: items[i] } };
    }
  }
  return { done, remaining: [], stopped: null };
}

/** Link to the activity on Strava (where deleting and other edits happen). */
export function stravaActivityUrl(id: number | string): string {
  return `https://www.strava.com/activities/${id}`;
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Snake-case, LLM-friendly view of an activity. */
export function compactActivity(a: Activity) {
  return {
    id: a.id,
    athlete: a.athlete,
    sport: bucketOf(a.sport),
    sport_label: BUCKET_LABEL[bucketOf(a.sport)],
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
    strava_url: stravaActivityUrl(a.id),
  };
}
