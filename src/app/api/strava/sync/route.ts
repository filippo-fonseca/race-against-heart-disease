import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { loadAthleteRows } from "@/lib/training/db";
import { TRAINING_CACHE_TAG } from "@/lib/training/queries";
import { syncAthlete, TRAINING_START, type SyncStats } from "@/lib/training/sync";

/**
 * Reconciliation sync, hit by the Vercel cron in vercel.json every 30 minutes
 * (Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically). Picks
 * up anything the webhook missed and enriches summary-only rows.
 *
 * Optional `?since=YYYY-MM-DD` narrows the window for a manual run.
 */

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sinceParam = request.nextUrl.searchParams.get("since");
  const since = sinceParam ? new Date(`${sinceParam}T00:00:00Z`) : TRAINING_START;
  if (Number.isNaN(since.getTime())) {
    return new Response("Bad since", { status: 400 });
  }

  const athletes = await loadAthleteRows();
  const results: SyncStats[] = [];
  for (const athlete of athletes) {
    if (!athlete.refresh_token) continue;
    try {
      results.push(await syncAthlete(athlete, { since }));
    } catch (err) {
      results.push({
        athlete: athlete.slug,
        listed: 0,
        upserted: 0,
        detailed: 0,
        skipped: 0,
        budgetExhausted: false,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  if (results.some((r) => r.upserted > 0)) {
    revalidateTag(TRAINING_CACHE_TAG, "max");
  }

  return Response.json({ since: since.toISOString(), results });
}
