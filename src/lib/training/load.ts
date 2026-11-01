import { cacheLife, cacheTag } from "next/cache";
import type { Activity, Athlete } from "./types";
import { PLAN_START } from "./plan";
import { TRAINING_CACHE_TAG, listActivities, listAthletes } from "./queries";

/**
 * What the /training page reads. One cached Supabase round trip for both
 * athletes and every activity since the program started; the page filters
 * in memory. Everything time-dependent (today, the athlete filter) stays
 * outside the cache so the entry is keyed only on the data.
 */
export interface TrainingData {
  athletes: Athlete[];
  activities: Activity[];
  /** Set when the query failed and the page is rendering empty. */
  error: string | null;
}

/** The two slugs the plan knows about, used until the athletes table has rows. */
export const DEFAULT_ATHLETES: Athlete[] = [
  { slug: "filippo", name: "Filippo", stravaId: null, avatarUrl: null },
  { slug: "emir", name: "Emir", stravaId: null, avatarUrl: null },
];

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
    const [athletes, activities] = await Promise.all([listAthletes(), listActivities({ from: PLAN_START })]);
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

/**
 * The athletes to show: every known slug, with the DB row's name and avatar
 * where one exists. Guarantees the toggle has both names even before the
 * athletes table is populated.
 */
export function resolveAthletes(fromDb: Athlete[]): Athlete[] {
  return DEFAULT_ATHLETES.map((d) => fromDb.find((a) => a.slug === d.slug) ?? d);
}
