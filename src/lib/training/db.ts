import "server-only";
import { createClient } from "@supabase/supabase-js";
import type {
  Activity,
  ActivityPhoto,
  Athlete,
  AthleteSlug,
  Sport,
} from "./types";

/**
 * Server-only Supabase access for the training log. Uses the service-role key,
 * so this module must never be imported from a Client Component. Scripts run
 * it under `tsx --conditions=react-server` so the `server-only` marker is inert.
 *
 * Tables live in the `training` Postgres schema (the Supabase project is
 * shared), so the client is pinned to it and `.from("activities")` resolves to
 * `training.activities`.
 */

/** Row shape of `training.athletes`. */
export interface AthleteRow {
  slug: AthleteSlug;
  name: string;
  strava_id: number | null;
  avatar_url: string | null;
  access_token: string | null;
  refresh_token: string | null;
  /** Unix seconds. */
  expires_at: number | null;
  created_at: string;
}

/** Row shape of `training.activities`. */
export interface ActivityRow {
  id: number;
  athlete_slug: AthleteSlug;
  sport: Sport;
  strava_sport_type: string;
  name: string;
  description: string | null;
  start_local: string;
  date: string;
  moving_time_sec: number | null;
  elapsed_time_sec: number | null;
  distance_m: number | string | null;
  elevation_gain_m: number | string | null;
  avg_hr: number | string | null;
  max_hr: number | string | null;
  avg_watts: number | string | null;
  effort: number | string | null;
  photos: ActivityPhoto[] | null;
  detailed: boolean;
  raw: unknown;
  updated_at: string;
}

/** Columns we write; `updated_at` is set by the caller. */
export type ActivityInsert = Omit<ActivityRow, "updated_at"> & {
  updated_at?: string;
};

function makeClient(url: string, key: string) {
  return createClient(url, key, {
    db: { schema: "training" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** supabase-js client pinned to the `training` schema. */
export type TrainingClient = ReturnType<typeof makeClient>;

let client: TrainingClient | null = null;

/** Lazily constructed singleton. Throws if the env is missing. */
export function db(): TrainingClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  client = makeClient(url, key);
  return client;
}

/** Postgres `numeric` comes back as a string; normalise to a number. */
function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toAthlete(row: AthleteRow): Athlete {
  return {
    slug: row.slug,
    name: row.name,
    stravaId: row.strava_id,
    avatarUrl: row.avatar_url,
  };
}

export function toActivity(row: ActivityRow): Activity {
  return {
    id: String(row.id),
    athlete: row.athlete_slug,
    sport: row.sport,
    stravaSportType: row.strava_sport_type,
    name: row.name,
    description: row.description,
    startLocal: row.start_local,
    date: row.date,
    movingTimeSec: row.moving_time_sec ?? 0,
    elapsedTimeSec: row.elapsed_time_sec ?? 0,
    distanceM: num(row.distance_m) ?? 0,
    elevationGainM: num(row.elevation_gain_m) ?? 0,
    avgHr: num(row.avg_hr),
    maxHr: num(row.max_hr),
    avgWatts: num(row.avg_watts),
    effort: num(row.effort),
    photos: Array.isArray(row.photos) ? row.photos : [],
    detailed: row.detailed,
  };
}

export function toActivityRow(activity: Activity, raw: unknown = null): ActivityInsert {
  return {
    id: Number(activity.id),
    athlete_slug: activity.athlete,
    sport: activity.sport,
    strava_sport_type: activity.stravaSportType,
    name: activity.name,
    description: activity.description,
    start_local: activity.startLocal,
    date: activity.date,
    moving_time_sec: activity.movingTimeSec,
    elapsed_time_sec: activity.elapsedTimeSec,
    distance_m: activity.distanceM,
    elevation_gain_m: activity.elevationGainM,
    avg_hr: activity.avgHr,
    max_hr: activity.maxHr,
    avg_watts: activity.avgWatts,
    effort: activity.effort,
    photos: activity.photos,
    detailed: activity.detailed,
    raw,
    updated_at: new Date().toISOString(),
  };
}

/** Load every athlete row, tokens included. Server use only. */
export async function loadAthleteRows(): Promise<AthleteRow[]> {
  const { data, error } = await db()
    .from("athletes")
    .select("*")
    .order("slug");
  if (error) throw error;
  return (data ?? []) as AthleteRow[];
}

export async function loadAthleteRow(slug: AthleteSlug): Promise<AthleteRow | null> {
  const { data, error } = await db()
    .from("athletes")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as AthleteRow | null) ?? null;
}

export async function loadAthleteRowByStravaId(stravaId: number): Promise<AthleteRow | null> {
  const { data, error } = await db()
    .from("athletes")
    .select("*")
    .eq("strava_id", stravaId)
    .maybeSingle();
  if (error) throw error;
  return (data as AthleteRow | null) ?? null;
}

export async function upsertAthleteRow(
  row: Omit<AthleteRow, "created_at">,
): Promise<void> {
  const { error } = await db()
    .from("athletes")
    .upsert(row, { onConflict: "slug" });
  if (error) throw error;
}

/** Persist a rotated token set after a refresh. */
export async function saveAthleteTokens(
  slug: AthleteSlug,
  tokens: { access_token: string; refresh_token: string; expires_at: number },
): Promise<void> {
  const { error } = await db().from("athletes").update(tokens).eq("slug", slug);
  if (error) throw error;
}
