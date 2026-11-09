import { loadAthleteRow, loadAthleteRows, type AthleteRow } from "../training/db";
import { getActivity, listActivities } from "../training/queries";
import { createActivity, getValidToken, nearRateLimit, StravaError, StravaWriteAccessError, updateActivity } from "../training/strava";
import { syncActivity, syncAthlete, TRAINING_START, type SyncStats } from "../training/sync";
import type { Activity, AthleteSlug } from "../training/types";
import {
  buildStravaCreate,
  buildStravaUpdate,
  compactActivity,
  createSequentially,
  stravaActivityUrl,
  type ActivityUpdateFields,
  type LogActivityInput,
  type PlannedCreate,
} from "./activity-logic";
import { invalidateTraining } from "./cache";
import { assertDate, athletesFor, McpToolError, todayForAthletes, TRAINING_START_DATE, validateRange, type AthleteChoice } from "./validate";

/**
 * Activity tools. Strava is the single source of truth: these tools write
 * to Strava through its API, then pull the result back into the Supabase
 * mirror with `syncActivity` so the site shows it at once instead of waiting
 * for the webhook. They never insert, edit or delete mirror rows on their
 * own. Server only (Supabase, Strava).
 */

export const ACTIVITY_LIST_MAX_DAYS = 200;

/** Keep this many Strava requests in reserve; each logged session costs about three. */
const RATE_LIMIT_MARGIN = 10;

/** Parse an activity id from the caller: a positive integer (a Strava id), as string or number. */
export function parseActivityId(raw: string | number): number {
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isSafeInteger(n) || n <= 0) throw new McpToolError(`Activity id "${String(raw)}" is not a valid id (use the id from list_activities).`);
  return n;
}

/** An activity that is already in the mirror (so it exists on Strava and belongs to a known athlete). */
export async function requireActivity(id: number): Promise<Activity> {
  const activity = await getActivity(id);
  if (!activity) throw new McpToolError(`No activity with id ${id}. Call list_activities to find it, or resync_strava if it is new on Strava.`);
  return activity;
}

/** Turn Strava write failures into messages the bot can relay. */
function stravaFailure(err: unknown, athlete: AthleteSlug): never {
  if (err instanceof StravaWriteAccessError) {
    throw new McpToolError(err.message.replace("<slug>", athlete));
  }
  if (err instanceof StravaError) {
    throw new McpToolError(`${err.message}. Strava said: ${err.body.slice(0, 300) || "(no body)"}`);
  }
  throw err;
}

/** The athlete's row, refusing athletes whose Strava is not linked. */
async function linkedAthlete(slug: AthleteSlug, rows?: AthleteRow[]): Promise<AthleteRow> {
  const row = rows ? (rows.find((r) => r.slug === slug) ?? null) : await loadAthleteRow(slug);
  if (!row || !row.refresh_token) {
    throw new McpToolError(`${slug} has not linked Strava, so activities cannot be written for them. Run \`npm run strava:auth -- --athlete ${slug}\` first.`);
  }
  return row;
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

/**
 * Create sessions on Strava, one at a time, and mirror each one right away.
 * Everything is validated before the first request. Same-day, same-sport
 * activities already on file block the call unless allow_duplicates is set:
 * a Strava activity cannot be deleted through the API, so a duplicate would
 * need the athlete to delete it in the Strava app.
 */
export async function logActivities(args: { activities: LogActivityInput[]; allow_duplicates?: boolean }) {
  if (args.activities.length === 0) throw new McpToolError("activities is empty.");
  const today = todayForAthletes();
  const planned: PlannedCreate[] = [];
  args.activities.forEach((input, index) => {
    const payload = buildStravaCreate(input, { today, index });
    for (const athlete of athletesFor(input.athlete)) planned.push({ index, athlete, payload });
  });

  const rows = await loadAthleteRows();
  const athletes = new Map<AthleteSlug, AthleteRow>();
  for (const slug of new Set(planned.map((p) => p.athlete))) athletes.set(slug, await linkedAthlete(slug, rows));

  const dates = planned.map((p) => p.payload.start_date_local.slice(0, 10)).sort();
  const nearby = await listActivities({ from: dates[0], to: dates[dates.length - 1] });
  const warnings: string[] = [];
  const clashes: string[] = [];
  for (const p of planned) {
    const date = p.payload.start_date_local.slice(0, 10);
    const sport = args.activities[p.index].sport;
    for (const c of nearby.filter((n) => n.athlete === p.athlete && n.date === date && n.sport === sport)) {
      clashes.push(`activities[${p.index}]: ${p.athlete} already has a ${c.sport} on ${date} ("${c.name}", id ${c.id}).`);
    }
    if (date < TRAINING_START_DATE) warnings.push(`activities[${p.index}]: ${date} is before day 1 of training (${TRAINING_START_DATE}), so the site will not show it.`);
  }
  if (clashes.length > 0 && !args.allow_duplicates) {
    throw new McpToolError(
      `Nothing was logged: ${clashes.join(" ")} If these are the same sessions, they are already on Strava. If they are really separate sessions, call again with allow_duplicates true.`,
    );
  }

  const result = await createSequentially(planned, {
    nearLimit: () => nearRateLimit(RATE_LIMIT_MARGIN),
    create: async (p) => {
      const athlete = athletes.get(p.athlete)!;
      const token = await getValidToken(athlete);
      let created;
      try {
        created = await createActivity(token, p.payload);
      } catch (err) {
        stravaFailure(err, p.athlete);
      }
      // Mirror it now; the webhook will deliver the same activity again later.
      try {
        return { activity: compactActivity(await syncActivity(athlete, created.id)), sync_error: null };
      } catch (err) {
        return {
          activity: { id: String(created.id), athlete: p.athlete, name: created.name, strava_url: stravaActivityUrl(created.id) },
          sync_error: `Created on Strava but not mirrored yet (${err instanceof Error ? err.message : String(err)}); the webhook or resync_strava will bring it in.`,
        };
      }
    },
  });

  if (result.done.length > 0) invalidateTraining();
  return {
    logged: result.done.length,
    requested: planned.length,
    ids: result.done.map((d) => d.activity.id),
    activities: result.done.map((d) => d.activity),
    sync_errors: result.done.map((d) => d.sync_error).filter((e): e is string => e !== null),
    stopped_early: result.stopped
      ? {
          reason: result.stopped.reason,
          message: result.stopped.message,
          not_logged: result.remaining.map((p) => ({ index: p.index, athlete: p.athlete, name: p.payload.name, date: p.payload.start_date_local.slice(0, 10) })),
        }
      : null,
    warnings: [...warnings, ...(clashes.length > 0 ? clashes.map((c) => `Logged despite: ${c}`) : [])],
  };
}

/** Edit the Strava-updatable fields of one activity, then re-mirror it. */
export async function updateActivityTool(args: { id: string | number; fields: ActivityUpdateFields }) {
  const id = parseActivityId(args.id);
  const current = await requireActivity(id);
  const patch = buildStravaUpdate(current, args.fields);
  const athlete = await linkedAthlete(current.athlete);
  const token = await getValidToken(athlete);
  try {
    await updateActivity(token, id, patch);
  } catch (err) {
    stravaFailure(err, current.athlete);
  }
  const updated = await syncActivity(athlete, id);
  invalidateTraining();
  return {
    updated: compactActivity(updated),
    changed_fields: Object.keys(patch),
  };
}

/**
 * Strava's public API cannot delete activities, and the mirror must not
 * drift from Strava, so this only explains where to delete it. Once the
 * athlete deletes it in the Strava app, the webhook removes it from the site
 * (and deletes any photos uploaded to it).
 */
export async function deleteActivityTool(args: { id: string | number }) {
  const id = parseActivityId(args.id);
  const current = await requireActivity(id);
  return {
    deleted: false,
    activity: compactActivity(current),
    strava_url: stravaActivityUrl(id),
    message: `Strava's API does not allow deleting activities, so this has to be done in the Strava app or website: open ${stravaActivityUrl(id)}, then Actions (the ... menu) > Delete. The site removes it automatically within a minute of the deletion.`,
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
