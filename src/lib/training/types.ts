/**
 * Shared contract for the training log. Both the data layer (Strava → DB)
 * and the UI code against these types. Change here first, then everywhere.
 */

export type Sport = "swim" | "bike" | "run" | "strength" | "other";

export type AthleteSlug = "filippo" | "amir";

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
  /** YYYY-MM-DD in the athlete's local time. Used for calendar + plan matching. */
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

/** One prescribed session in the training program. */
export interface PlanSession {
  id: string;
  /** YYYY-MM-DD. Program starts 2026-11-02. */
  date: string;
  sport: Sport;
  title: string;
  /** Free-text prescription, e.g. "4 × 8 min @ threshold, 3 min easy". */
  detail: string | null;
  targetMin: number | null;
  targetKm: number | null;
  /** Optional: which athlete(s) this is for. Empty = everyone. */
  athletes: AthleteSlug[];
  /** Which training block/phase this belongs to, e.g. "Base 1". */
  phase: string | null;
  week: number;
}

export type MatchStatus = "done" | "partial" | "missed" | "upcoming" | "rest";

/** A planned session paired with what actually happened. */
export interface DayMatch {
  date: string;
  athlete: AthleteSlug;
  planned: PlanSession[];
  actual: Activity[];
  status: MatchStatus;
}

export interface WeeklyTotals {
  /** ISO week start (Monday), YYYY-MM-DD. */
  weekStart: string;
  athlete: AthleteSlug;
  bySport: Record<Sport, { timeSec: number; distanceM: number; count: number }>;
  totalTimeSec: number;
  plannedTimeSec: number;
}

export interface TrainingSummary {
  athlete: AthleteSlug;
  since: string;
  totalTimeSec: number;
  totalDistanceM: number;
  sessions: number;
  /** Consecutive days with at least one activity, counting back from today. */
  streakDays: number;
  bySport: Record<Sport, { timeSec: number; distanceM: number; count: number }>;
}

/** Map a Strava sport_type onto our five buckets. */
export function toSport(stravaSportType: string): Sport {
  const t = stravaSportType.toLowerCase();
  if (t.includes("swim")) return "swim";
  if (t.includes("ride") || t.includes("cycling") || t === "velomobile") return "bike";
  if (t.includes("run") || t === "walk" || t === "hike") return "run";
  if (
    t.includes("weight") ||
    t.includes("crossfit") ||
    t.includes("workout") ||
    t.includes("yoga") ||
    t.includes("pilates")
  )
    return "strength";
  return "other";
}
