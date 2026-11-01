import { cacheLife, cacheTag } from "next/cache";
import { listPlanSessions } from "../admin/plan-db";
import { TRAINING_CACHE_TAG } from "./queries";
import type { PlanSession } from "./types";

/**
 * The cached, DB-backed side of `getPlan()`. Kept in its own module (and
 * imported lazily from plan.ts) because it pulls in `next/cache` and the
 * server-only Supabase client, neither of which tests or scripts can load.
 */
export interface PlanSource {
  plan: PlanSession[];
  /** Set when the query failed; the caller falls back to the bundled JSON. */
  error: string | null;
}

/**
 * One cached round trip for the whole program. Tagged with TRAINING_CACHE_TAG
 * so the admin import and the Strava routes revalidate it after writing; the
 * hourly lifetime is the backstop. A failed query is kept only for seconds so
 * a blip does not pin the fallback plan.
 */
export async function fetchPlanFromDb(): Promise<PlanSource> {
  "use cache";
  cacheTag(TRAINING_CACHE_TAG);
  try {
    const plan = await listPlanSessions();
    cacheLife("hours");
    return { plan, error: null };
  } catch (err) {
    cacheLife("seconds");
    return { plan: [], error: err instanceof Error ? err.message : String(err) };
  }
}
