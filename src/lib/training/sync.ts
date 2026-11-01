import type { Activity } from "./types";
import { db, toActivityRow, type AthleteRow } from "./db";
import {
  getActivity,
  getValidToken,
  listActivities,
  nearRateLimit,
  normalizeActivity,
  StravaError,
} from "./strava";

/**
 * Strava → Supabase. The webhook calls `syncActivity`; the cron and the
 * backfill script call `syncAthlete`. Pages never touch this module.
 */

/** Training starts here; nothing earlier is synced. */
export const TRAINING_START = new Date("2026-11-02T00:00:00Z");

export interface SyncStats {
  athlete: string;
  /** Summaries seen in the listing. */
  listed: number;
  /** Rows written (summary or detail). */
  upserted: number;
  /** Rows enriched with the detail + photos calls. */
  detailed: number;
  /** Already detailed; left alone. */
  skipped: number;
  /** Stopped early because the request budget or Strava's limit was reached. */
  budgetExhausted: boolean;
  errors: string[];
}

export async function upsertActivity(activity: Activity, raw: unknown = null): Promise<void> {
  const { error } = await db()
    .from("activities")
    .upsert(toActivityRow(activity, raw), { onConflict: "id" });
  if (error) throw error;
}

export async function deleteActivity(id: number | string): Promise<void> {
  const { error } = await db().from("activities").delete().eq("id", Number(id));
  if (error) throw error;
}

/** Fetch one activity in full (detail + photos) and store it. */
export async function syncActivity(athlete: AthleteRow, id: number | string): Promise<Activity> {
  const token = await getValidToken(athlete);
  const { detail, photos } = await getActivity(token, id);
  const activity = normalizeActivity(athlete.slug, detail, photos, true);
  await upsertActivity(activity, detail);
  return activity;
}

async function loadDetailedIds(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await db()
    .from("activities")
    .select("id")
    .in("id", ids)
    .eq("detailed", true);
  if (error) throw error;
  return new Set((data ?? []).map((r) => Number((r as { id: number }).id)));
}

/**
 * Pull every activity since `since` for one athlete. Listing costs one
 * request per 100 activities; each not-yet-detailed activity costs one or two
 * more (detail, then photos if there are any). `budget` caps the number of
 * activities enriched per run so two athletes on a 30-minute cron stay well
 * under Strava's 100 requests / 15 minutes. Anything left over is stored as a
 * summary (`detailed=false`) and picked up by the next run.
 */
export async function syncAthlete(
  athlete: AthleteRow,
  opts: { since?: Date; budget?: number } = {},
): Promise<SyncStats> {
  const since = opts.since ?? TRAINING_START;
  let budget = opts.budget ?? 25;
  const stats: SyncStats = {
    athlete: athlete.slug,
    listed: 0,
    upserted: 0,
    detailed: 0,
    skipped: 0,
    budgetExhausted: false,
    errors: [],
  };

  const token = await getValidToken(athlete);

  for (let page = 1; ; page++) {
    const summaries = await listActivities(token, { after: since, page, perPage: 100 });
    if (summaries.length === 0) break;
    stats.listed += summaries.length;

    const alreadyDetailed = await loadDetailedIds(summaries.map((s) => s.id));

    for (const summary of summaries) {
      if (alreadyDetailed.has(summary.id)) {
        stats.skipped++;
        continue;
      }
      const canDetail = budget > 0 && !nearRateLimit();
      if (!canDetail) {
        stats.budgetExhausted = true;
        await upsertActivity(normalizeActivity(athlete.slug, summary), summary);
        stats.upserted++;
        continue;
      }
      try {
        budget--;
        await syncActivity(athlete, summary.id);
        stats.detailed++;
        stats.upserted++;
      } catch (err) {
        stats.errors.push(`${summary.id}: ${describe(err)}`);
        if (err instanceof StravaError && err.status === 429) {
          stats.budgetExhausted = true;
          budget = 0;
        }
        // Keep the summary so the activity still shows up.
        await upsertActivity(normalizeActivity(athlete.slug, summary), summary);
        stats.upserted++;
      }
    }

    if (summaries.length < 100) break;
    if (nearRateLimit(5)) {
      stats.budgetExhausted = true;
      break;
    }
  }

  return stats;
}

function describe(err: unknown): string {
  if (err instanceof StravaError) return `${err.message} ${err.body.slice(0, 200)}`;
  return err instanceof Error ? err.message : String(err);
}
