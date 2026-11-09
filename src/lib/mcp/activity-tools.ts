import { db, loadAthleteRows, upsertAthleteRow } from "../training/db";
import { getActivity, listActivities, listAthletes } from "../training/queries";
import { deleteActivity, syncAthlete, TRAINING_START, upsertActivity, type SyncStats } from "../training/sync";
import { PLAN_START } from "../training/plan";
import type { Activity, AthleteSlug } from "../training/types";
import {
  activityPatch,
  buildManualActivity,
  compactActivity,
  isManualId,
  manualActivityId,
  sourceOf,
  type ActivityPatchInput,
  type ManualActivityInput,
} from "./activity-logic";
import { invalidateTraining } from "./cache";
import { removeStoredPhotos } from "./photo-storage";
import { assertDate, athletesFor, McpToolError, todayForAthletes, validateRange, type AthleteChoice } from "./validate";

/**
 * Activity tools: list, log manual sessions, update, delete, resync from
 * Strava. Server only (Supabase, Strava). Every write revalidates the
 * training cache.
 */

export const ACTIVITY_LIST_MAX_DAYS = 200;

/** Parse an activity id from the caller: a non-zero integer, as string or number. */
export function parseActivityId(raw: string | number): number {
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isSafeInteger(n) || n === 0) throw new McpToolError(`Activity id "${String(raw)}" is not a valid id (use the id from list_activities).`);
  return n;
}

export async function requireActivity(id: number): Promise<Activity> {
  const activity = await getActivity(id);
  if (!activity) throw new McpToolError(`No activity with id ${id}. Call list_activities to find it.`);
  return activity;
}

export async function listActivitiesTool(args: { from: string; to: string; athlete?: AthleteChoice }) {
  const { from, to } = validateRange(args.from, args.to, ACTIVITY_LIST_MAX_DAYS);
  const athlete = args.athlete && args.athlete !== "both" ? args.athlete : undefined;
  const rows = await listActivities({ from, to, athlete });
  return {
    from,
    to,
    athlete: athlete ?? "both",
    count: rows.length,
    activities: rows.map(compactActivity),
  };
}

const DISPLAY_NAME: Record<AthleteSlug, string> = { filippo: "Filippo", emir: "Emir" };

/**
 * Activities reference training.athletes, so an athlete who has not linked
 * Strava yet needs a bare row first. Creates only the missing ones.
 */
async function ensureAthleteRows(slugs: AthleteSlug[]): Promise<AthleteSlug[]> {
  const present = new Set((await listAthletes()).map((a) => a.slug));
  const missing = [...new Set(slugs)].filter((s) => !present.has(s));
  for (const slug of missing) {
    await upsertAthleteRow({ slug, name: DISPLAY_NAME[slug], strava_id: null, avatar_url: null, access_token: null, refresh_token: null, expires_at: null });
  }
  return missing;
}

export async function logActivities(args: { activities: ManualActivityInput[] }) {
  if (args.activities.length === 0) throw new McpToolError("activities is empty.");
  const today = todayForAthletes();
  const used = new Set<number>();
  const built: Activity[] = [];
  args.activities.forEach((input, index) => {
    for (const athlete of athletesFor(input.athlete)) {
      let id = manualActivityId();
      while (used.has(id)) id -= 1;
      used.add(id);
      built.push(buildManualActivity(input, { id, athlete, today, index }));
    }
  });

  // Same athlete, day and sport already on file (often the Strava copy).
  const dates = built.map((a) => a.date).sort();
  const nearby = await listActivities({ from: dates[0], to: dates[dates.length - 1] });
  const warnings: string[] = [];
  for (const a of built) {
    const clash = nearby.filter((n) => n.athlete === a.athlete && n.date === a.date && n.sport === a.sport);
    for (const c of clash) {
      warnings.push(`${a.athlete} already has a ${sourceOf(c.id)} ${c.sport} on ${a.date} ("${c.name}", id ${c.id}). If it is the same session, delete the new one with delete_activity ${a.id}.`);
    }
    if (a.date < PLAN_START) warnings.push(`${a.date} is before the program start (${PLAN_START}), so /training will not show it.`);
  }

  const createdAthletes = await ensureAthleteRows(built.map((a) => a.athlete));
  const loggedAt = new Date().toISOString();
  for (const a of built) {
    await upsertActivity(a, { source: "manual", via: "mcp", logged_at: loggedAt });
  }
  invalidateTraining();
  return {
    logged: built.length,
    ids: built.map((a) => a.id),
    activities: built.map(compactActivity),
    warnings,
    created_athlete_rows: createdAthletes,
  };
}

export async function updateActivityTool(args: { id: string | number; fields: ActivityPatchInput }) {
  const id = parseActivityId(args.id);
  const current = await requireActivity(id);
  const patch = activityPatch(current, args.fields, todayForAthletes());
  const { error } = await db()
    .from("activities")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  invalidateTraining();
  const updated = await requireActivity(id);
  return {
    updated: compactActivity(updated),
    changed_columns: Object.keys(patch),
    warning: isManualId(id)
      ? null
      : "This is a Strava activity: if it is edited on Strava (or resynced before it was fully detailed), Strava's values overwrite these edits. Edit it on Strava too to make the change stick.",
  };
}

export async function deleteActivityTool(args: { id: string | number }) {
  const id = parseActivityId(args.id);
  const current = await requireActivity(id);
  await deleteActivity(id);
  invalidateTraining();
  const failed = await removeStoredPhotos(current.photos);
  return {
    deleted: compactActivity(current),
    storage_cleanup_failed: failed,
    warning: isManualId(id) ? null : "This was a Strava activity: the next Strava sync restores it unless it is also deleted on Strava.",
  };
}

export async function resyncStrava(args: { athlete?: AthleteChoice; since?: string; budget?: number }) {
  const wanted = new Set(athletesFor(args.athlete));
  const since = args.since ? new Date(`${assertDate(args.since, "since")}T00:00:00Z`) : TRAINING_START;
  // Two athletes inside the route's 60 s: a detail fetch is one or two Strava calls.
  const budget = Math.min(Math.max(args.budget ?? 10, 0), 25);
  const rows = (await loadAthleteRows()).filter((a) => wanted.has(a.slug));
  const results: (SyncStats | { athlete: string; skipped_reason: string })[] = [];
  for (const athlete of rows) {
    if (!athlete.refresh_token) {
      results.push({ athlete: athlete.slug, skipped_reason: "Strava is not linked for this athlete." });
      continue;
    }
    try {
      results.push(await syncAthlete(athlete, { since, budget }));
    } catch (err) {
      results.push({ athlete: athlete.slug, listed: 0, upserted: 0, detailed: 0, skipped: 0, budgetExhausted: false, errors: [err instanceof Error ? err.message : String(err)] });
    }
  }
  for (const slug of wanted) {
    if (!rows.some((r) => r.slug === slug)) results.push({ athlete: slug, skipped_reason: "No athlete row yet (Strava never linked)." });
  }
  if (results.some((r) => "upserted" in r && r.upserted > 0)) invalidateTraining();
  return {
    since: since.toISOString().slice(0, 10),
    budget_per_athlete: budget,
    results,
    note: results.some((r) => "budgetExhausted" in r && r.budgetExhausted)
      ? "Budget or Strava rate limit reached: some activities were stored as summaries and will be detailed by the next run."
      : null,
  };
}
