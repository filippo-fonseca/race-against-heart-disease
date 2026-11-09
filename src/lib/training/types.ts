/**
 * Shared contract for the training log. Both the data layer (Strava → DB)
 * and the UI code against these types. Change here first, then everywhere.
 */

/**
 * The four buckets the site shows, as pills: SWIM, BIKE, RUN and LIFT.
 * LIFT is `strength` internally and covers HIIT, weights, and anything that
 * is not a swim, a ride or a run.
 */
export type SportBucket = "swim" | "bike" | "run" | "strength";

/**
 * Sport on an activity. "other" is a legacy value: `toSport` never returns
 * it and rows are re-bucketed on read (db.ts), but the type keeps it so older
 * callers still compile. Use `bucketOf` before keying anything by sport.
 */
export type Sport = SportBucket | "other";

/** The buckets in display and stack order. */
export const SPORTS: readonly SportBucket[] = ["swim", "bike", "run", "strength"];

/** Collapse the legacy "other" into LIFT. */
export function bucketOf(sport: Sport): SportBucket {
  return sport === "other" ? "strength" : sport;
}

/** The site follows one athlete. Kept as a type so the DB column stays explicit. */
export type AthleteSlug = "filippo";

/** The only athlete the site loads. */
export const ATHLETE: AthleteSlug = "filippo";

export interface Athlete {
  slug: AthleteSlug;
  name: string;
  /** Strava athlete id, once authorized. */
  stravaId: number | null;
  avatarUrl: string | null;
}

export interface ActivityPhoto {
  /** Strava unique_id or our own id for uploads. */
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  caption: string | null;
}

export interface Activity {
  /** Strava activity id as string (bigint-safe). */
  id: string;
  athlete: AthleteSlug;
  sport: Sport;
  /** Raw Strava sport_type, e.g. "Ride", "VirtualRide", "Swim", "WeightTraining". */
  stravaSportType: string;
  name: string;
  description: string | null;
  /** ISO 8601, local start time with offset. */
  startLocal: string;
  /** YYYY-MM-DD in the athlete's local time. Keys the calendar, the feed and the window. */
  date: string;
  movingTimeSec: number;
  elapsedTimeSec: number;
  distanceM: number;
  elevationGainM: number;
  avgHr: number | null;
  maxHr: number | null;
  avgWatts: number | null;
  /** Strava's relative effort / suffer score. */
  effort: number | null;
  photos: ActivityPhoto[];
  /** Whether the record has been enriched with the activity-detail call. */
  detailed: boolean;
}

export interface WeeklyTotals {
  /** ISO week start (Monday), YYYY-MM-DD. */
  weekStart: string;
  bySport: Record<SportBucket, { timeSec: number; distanceM: number; count: number }>;
  totalTimeSec: number;
}

export interface TrainingSummary {
  since: string;
  totalTimeSec: number;
  totalDistanceM: number;
  sessions: number;
  /** Consecutive days with at least one activity, counting back from today. */
  streakDays: number;
  bySport: Record<SportBucket, { timeSec: number; distanceM: number; count: number }>;
}

/**
 * Map a Strava sport_type onto the four buckets. Any ride (outdoor, trainer,
 * VirtualRide, e-bike, gravel, mountain) is BIKE; any run (incl. trail and
 * virtual) is RUN; any swim is SWIM. Everything else, HIIT, weights,
 * workouts, yoga, walks and hikes included, is LIFT.
 */
export function toSport(stravaSportType: string): SportBucket {
  const t = stravaSportType.toLowerCase();
  if (t.includes("swim")) return "swim";
  if (t.includes("ride") || t.includes("cycling") || t === "velomobile" || t === "handcycle") return "bike";
  if (t.includes("run")) return "run";
  return "strength";
}
