import { deletePlanSessions, getPlanSessionsByIds, listPlanSessions, upsertPlanSessions } from "../admin/plan-db";
import type { PlanChange } from "../admin/plan-import";
import { eachDay } from "../training/dates";
import { appliesTo } from "../training/plan";
import type { AthleteSlug, PlanSession } from "../training/types";
import { invalidateTraining } from "./cache";
import {
  athleteLabel,
  compactPlanSession,
  deletePlanScope,
  normalizeBatch,
  planUpsertDiff,
  replaceRangeDiff,
  type Narrowing,
  type PlanSessionInput,
} from "./plan-logic";
import { ATHLETE_SLUGS, McpToolError, validateRange, type AthleteChoice } from "./validate";

/**
 * Plan tools: list, upsert, replace a range, delete. Server only (Supabase).
 * The decisions live in plan-logic.ts; this module loads rows, writes, and
 * revalidates the training cache after every write.
 */

/** Longest range list_plan accepts (the whole program is 154 days). */
export const LIST_MAX_DAYS = 200;
/** Longest range a single replace or ranged delete may touch. */
export const WRITE_MAX_DAYS = 62;

function restDays(from: string, to: string, sessions: PlanSession[], athlete: AthleteSlug): string[] {
  const busy = new Set(sessions.filter((s) => appliesTo(s, athlete)).map((s) => s.date));
  return eachDay(from, to).filter((d) => !busy.has(d));
}

export async function listPlan(args: { from: string; to: string; athlete?: AthleteChoice }) {
  const { from, to } = validateRange(args.from, args.to, LIST_MAX_DAYS);
  const athlete = args.athlete ?? "both";
  const rows = await listPlanSessions({ from, to });
  const sessions = athlete === "both" ? rows : rows.filter((s) => appliesTo(s, athlete));
  return {
    from,
    to,
    athlete,
    count: sessions.length,
    rest_days:
      athlete === "both"
        ? Object.fromEntries(ATHLETE_SLUGS.map((a) => [a, restDays(from, to, rows, a)]))
        : { [athlete]: restDays(from, to, rows, athlete) },
    sessions: sessions.map(compactPlanSession),
  };
}

function describeChange(c: PlanChange) {
  return { id: c.before.id, fields: c.fields, before: compactPlanSession(c.before), after: compactPlanSession(c.after) };
}

function describeNarrow(n: Narrowing) {
  return { id: n.before.id, title: n.before.title, date: n.before.date, sport: n.before.sport, now_only_for: athleteLabel(n.after.athletes) };
}

export async function upsertPlan(args: { sessions: PlanSessionInput[] }) {
  if (args.sessions.length === 0) throw new McpToolError("sessions is empty.");
  const incoming = normalizeBatch(args.sessions);
  const dates = incoming.map((n) => n.session.date).sort();
  const explicitIds = incoming.filter((n) => n.explicitId).map((n) => n.session.id);
  const [onDates, byId] = await Promise.all([
    listPlanSessions({ from: dates[0], to: dates[dates.length - 1] }),
    getPlanSessionsByIds(explicitIds),
  ]);
  const dateSet = new Set(dates);
  const existing = new Map<string, PlanSession>();
  for (const s of [...onDates.filter((r) => dateSet.has(r.date)), ...byId]) existing.set(s.id, s);

  const diff = planUpsertDiff(incoming, [...existing.values()]);
  const writes = [...diff.creates, ...diff.updates.map((u) => u.after)];
  if (writes.length > 0) {
    await upsertPlanSessions(writes);
    invalidateTraining();
  }
  return {
    created: diff.creates.length,
    updated: diff.updates.length,
    unchanged: diff.unchanged.length,
    created_ids: diff.creates.map((s) => s.id),
    updated_ids: diff.updates.map((u) => u.after.id),
    unchanged_ids: diff.unchanged.map((s) => s.id),
    changes: diff.updates.map(describeChange),
    sessions: writes.map(compactPlanSession),
  };
}

export async function replacePlanRange(args: { from: string; to: string; athlete?: AthleteChoice; sessions: PlanSessionInput[]; dry_run?: boolean }) {
  const { from, to } = validateRange(args.from, args.to, WRITE_MAX_DAYS);
  const athlete = args.athlete ?? "both";
  const incoming = normalizeBatch(args.sessions, athlete === "both" ? {} : { forceAthlete: athlete });
  const existing = await listPlanSessions({ from, to });
  const plan = replaceRangeDiff(incoming, existing, { from, to, athlete });

  const upserts = [...plan.creates, ...plan.updates.map((u) => u.after), ...plan.narrows.map((n) => n.after)];
  const deletes = plan.deletes.map((s) => s.id);
  const dryRun = args.dry_run ?? false;
  if (!dryRun) {
    if (upserts.length > 0) await upsertPlanSessions(upserts);
    if (deletes.length > 0) await deletePlanSessions(deletes);
    if (upserts.length > 0 || deletes.length > 0) invalidateTraining();
  }
  return {
    dry_run: dryRun,
    applied: !dryRun,
    from,
    to,
    athlete,
    summary: {
      create: plan.creates.length,
      update: plan.updates.length,
      narrow_to_other_athlete: plan.narrows.length,
      delete: plan.deletes.length,
      unchanged: plan.unchanged,
    },
    creates: plan.creates.map(compactPlanSession),
    updates: plan.updates.map(describeChange),
    narrows: plan.narrows.map(describeNarrow),
    deletes: plan.deletes.map(compactPlanSession),
  };
}

export async function deletePlan(args: { ids?: string[]; from?: string; to?: string; athlete?: AthleteChoice; dry_run?: boolean }) {
  const ids = (args.ids ?? []).map((id) => id.trim()).filter((id) => id.length > 0);
  const hasRange = Boolean(args.from || args.to);
  if (ids.length === 0 && !hasRange) {
    throw new McpToolError("Refusing an empty filter: pass ids, or both from and to.");
  }
  if (hasRange && !(args.from && args.to)) throw new McpToolError("A range needs both from and to.");

  let rows: PlanSession[];
  let missing: string[] = [];
  if (ids.length > 0) {
    rows = await getPlanSessionsByIds(ids);
    const found = new Set(rows.map((r) => r.id));
    missing = ids.filter((id) => !found.has(id));
    if (hasRange) {
      const { from, to } = validateRange(args.from, args.to, WRITE_MAX_DAYS);
      rows = rows.filter((r) => r.date >= from && r.date <= to);
    }
  } else {
    const { from, to } = validateRange(args.from, args.to, WRITE_MAX_DAYS);
    rows = await listPlanSessions({ from, to });
  }

  const athlete = args.athlete ?? "both";
  const scope = deletePlanScope(rows, athlete);
  const dryRun = args.dry_run ?? false;
  if (!dryRun) {
    if (scope.narrows.length > 0) await upsertPlanSessions(scope.narrows.map((n) => n.after));
    if (scope.deletes.length > 0) await deletePlanSessions(scope.deletes.map((s) => s.id));
    if (scope.narrows.length > 0 || scope.deletes.length > 0) invalidateTraining();
  }
  return {
    dry_run: dryRun,
    applied: !dryRun,
    athlete,
    deleted: scope.deletes.map(compactPlanSession),
    narrowed_to_other_athlete: scope.narrows.map(describeNarrow),
    skipped_not_for_this_athlete: scope.skipped.map((s) => s.id),
    missing_ids: missing,
  };
}
