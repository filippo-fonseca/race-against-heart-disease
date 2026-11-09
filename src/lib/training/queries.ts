import { ATHLETE, type Activity, type Athlete, type AthleteSlug } from "./types";
import { db, toActivity, toAthlete, type ActivityRow, type AthleteRow } from "./db";

/**
 * Read side of the training log. These are what pages and components import.
 * Everything comes from Supabase; nothing here talks to Strava. Server only
 * (via db.ts), so call these from Server Components, `use cache` functions,
 * or Route Handlers.
 */

/**
 * Cache tag the UI may attach with `cacheTag(TRAINING_CACHE_TAG)` inside a
 * `use cache` function. The sync and webhook routes revalidate it after
 * writing, so cached pages refresh on the next visit.
 */
export const TRAINING_CACHE_TAG = "training";

export interface ListActivitiesOptions {
  /** Whose activities. The site follows only Filippo, so that is the default. */
  athlete?: AthleteSlug;
  /** Inclusive lower bound, YYYY-MM-DD (athlete-local date). */
  from?: string;
  /** Inclusive upper bound, YYYY-MM-DD (athlete-local date). */
  to?: string;
  /** Row cap; defaults to no explicit cap (Supabase's 1000). */
  limit?: number;
}

/** Filippo's activities newest first, optionally within a date range. */
export async function listActivities(opts: ListActivitiesOptions = {}): Promise<Activity[]> {
  let q = db()
    .from("activities")
    .select(ACTIVITY_COLUMNS)
    .order("start_local", { ascending: false });
  q = q.eq("athlete_slug", opts.athlete ?? ATHLETE);
  if (opts.from) q = q.gte("date", opts.from);
  if (opts.to) q = q.lte("date", opts.to);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as ActivityRow[]).map(toActivity);
}

/** One activity by Strava id, or null. */
export async function getActivity(id: string | number): Promise<Activity | null> {
  const { data, error } = await db()
    .from("activities")
    .select(ACTIVITY_COLUMNS)
    .eq("id", Number(id))
    .maybeSingle();
  if (error) throw error;
  return data ? toActivity(data as unknown as ActivityRow) : null;
}

/** Filippo's athlete row (as a list, empty until authorized), without tokens. */
export async function listAthletes(): Promise<Athlete[]> {
  const { data, error } = await db()
    .from("athletes")
    .select("slug, name, strava_id, avatar_url")
    .eq("slug", ATHLETE);
  if (error) throw error;
  return ((data ?? []) as unknown as AthleteRow[]).map(toAthlete);
}

/**
 * Everything except `raw`, which can be large and is never shown, plus its
 * `utc_offset` so start times can be shown in local time (see toLocalStart).
 */
const ACTIVITY_COLUMNS =
  "id, athlete_slug, sport, strava_sport_type, name, description, start_local, date, moving_time_sec, elapsed_time_sec, distance_m, elevation_gain_m, avg_hr, max_hr, avg_watts, effort, photos, detailed, updated_at, utc_offset:raw->utc_offset";
