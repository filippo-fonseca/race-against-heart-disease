import { cacheLife, cacheTag } from "next/cache";
import type { Activity, Athlete } from "./types";
import { RACE_DAY, TRAINING_START } from "./dates";
import { TRAINING_CACHE_TAG, listActivities, listAthletes } from "./queries";

/**
 * What /training and the homepage Strava card read. One cached Supabase round
 * trip for Filippo's athlete row and every activity of his in the training
 * window (Nov 2 to race day). Everything time-dependent (today) stays outside
 * the cache so the entry is keyed only on the data.
 */
export interface TrainingData {
  athletes: Athlete[];
  activities: Activity[];
  /** Set when the query failed and the page is rendering empty. */
  error: string | null;
}

/** Filippo, used until the athletes table has his row. */
export const DEFAULT_ATHLETE: Athlete = { slug: "filippo", name: "Filippo", stravaId: null, avatarUrl: null };

const EMPTY: TrainingData = { athletes: [], activities: [], error: null };

/**
 * Cached read. Tagged with TRAINING_CACHE_TAG so the Strava webhook and the
 * sync cron revalidate it after writing; the hourly lifetime is the backstop.
 * A failed query is kept only for seconds so a blip does not pin an empty page.
 */
async function fetchTrainingData(): Promise<TrainingData> {
  "use cache";
  cacheTag(TRAINING_CACHE_TAG);
  try {
    const [athletes, activities] = await Promise.all([listAthletes(), listActivities({ from: TRAINING_START, to: RACE_DAY })]);
    cacheLife("hours");
    return { athletes, activities, error: null };
  } catch (err) {
    cacheLife("seconds");
    return { ...EMPTY, error: err instanceof Error ? err.message : String(err) };
  }
}

let warned = false;
function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  console.warn(`[training] ${message} Rendering with zero activities.`);
}

/** Supabase data, or an empty set (logged once) when the env is missing or the query fails. */
export async function loadTraining(): Promise<TrainingData> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    warnOnce("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    return EMPTY;
  }
  const data = await fetchTrainingData();
  if (data.error) warnOnce(`Query failed: ${data.error}.`);
  return data;
}

/** Filippo's athlete record: the DB row when there is one, else the default. */
export function resolveAthlete(fromDb: Athlete[]): Athlete {
  return fromDb.find((a) => a.slug === DEFAULT_ATHLETE.slug) ?? DEFAULT_ATHLETE;
}
