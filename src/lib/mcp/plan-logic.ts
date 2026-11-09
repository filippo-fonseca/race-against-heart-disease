import { changedFields, deriveId, diffPlan, slug, type PlanChange } from "../admin/plan-import";
import { appliesTo, PLAN_WEEKS, phaseForWeek, planWindow, weekOf } from "../training/plan";
import type { AthleteSlug, PlanSession, Sport } from "../training/types";
import { assertDate, ATHLETE_SLUGS, McpToolError, planAthletes, type AthleteChoice } from "./validate";

/**
 * Pure planning logic behind the MCP plan tools. It reuses the admin import's
 * id derivation (`deriveId`) and diff (`diffPlan`, natural-key matching) and
 * the program calendar (`weekOf`, `phaseForWeek`, `planWindow`), so a session
 * written by the bot is indistinguishable from one uploaded on /admin.
 *
 * Shared rows (empty `athletes`, or both slugs listed) need care when the
 * caller edits one athlete's plan: the other athlete must keep the session.
 * Such rows are "narrowed" to the other athlete instead of being changed or
 * deleted in place.
 */

export const SPORTS: readonly Sport[] = ["swim", "bike", "run", "strength", "other"];

/** One session as an MCP caller sends it. */
export interface PlanSessionInput {
  id?: string | null;
  date: string;
  sport: Sport;
  title: string;
  detail?: string | null;
  target_min?: number | null;
  target_km?: number | null;
  athlete?: AthleteChoice | null;
  phase?: string | null;
  week?: number | null;
}

export interface NormalizedInput {
  session: PlanSession;
  /** True when the caller supplied the id (so it is matched by id, never renamed). */
  explicitId: boolean;
}

function blank(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length === 0 ? null : t;
}

/**
 * Validate one input and fill the derived fields the way parsePlanCsv does:
 * id = `<date>-<sport>-<slug of title>` when omitted, week from the date
 * (a supplied week must agree), and phase from the week when omitted.
 * `forceAthlete` pins the session to one athlete (athlete-scoped replace).
 */
export function normalizePlanInput(input: PlanSessionInput, index: number, opts: { forceAthlete?: AthleteSlug } = {}): NormalizedInput {
  const where = `sessions[${index}]`;
  const date = assertDate(input.date, `${where}.date`);
  const { from, to } = planWindow();
  if (date < from || date > to) throw new McpToolError(`${where}.date ${date} is outside the program (${from} to ${to}).`);
  if (!SPORTS.includes(input.sport)) throw new McpToolError(`${where}.sport "${String(input.sport)}" must be one of ${SPORTS.join(", ")}.`);
  const title = (input.title ?? "").trim();
  if (title.length === 0) throw new McpToolError(`${where}.title is required.`);

  const targetMin = input.target_min ?? null;
  if (targetMin !== null && (!Number.isInteger(targetMin) || targetMin < 0)) throw new McpToolError(`${where}.target_min must be a whole number of minutes.`);
  const targetKm = input.target_km ?? null;
  if (targetKm !== null && (!Number.isFinite(targetKm) || targetKm < 0)) throw new McpToolError(`${where}.target_km must be a non-negative number.`);

  let athletes: AthleteSlug[];
  if (opts.forceAthlete) {
    if (input.athlete && input.athlete !== opts.forceAthlete) {
      throw new McpToolError(`${where}.athlete is "${input.athlete}" but this call is scoped to ${opts.forceAthlete}. Omit athlete on each session, or use athlete "both" for the whole call.`);
    }
    athletes = [opts.forceAthlete];
  } else {
    athletes = planAthletes(input.athlete);
  }

  const derivedWeek = weekOf(date).week;
  const week = input.week ?? derivedWeek;
  if (!Number.isInteger(week) || week < 1 || week > PLAN_WEEKS) throw new McpToolError(`${where}.week must be 1 to ${PLAN_WEEKS}.`);
  if (week !== derivedWeek) throw new McpToolError(`${where}.week ${week} does not match the date: ${date} falls in week ${derivedWeek}. Omit week to derive it.`);

  const phase = blank(input.phase) ?? phaseForWeek(week);
  const givenId = blank(input.id);
  const id = givenId ?? deriveId(date, input.sport, title);

  return {
    session: { id, date, sport: input.sport, title, detail: blank(input.detail), targetMin, targetKm, athletes, phase, week },
    explicitId: givenId !== null,
  };
}

/**
 * Normalise a batch. Two sessions with the same date, sport, title and
 * athletes, or the same explicit id, are an error. The same title for
 * different athletes is fine: the later derived id gets an athlete suffix
 * so every id in the batch is unique.
 */
export function normalizeBatch(inputs: PlanSessionInput[], opts: { forceAthlete?: AthleteSlug } = {}): NormalizedInput[] {
  const out = inputs.map((s, i) => normalizePlanInput(s, i, opts));
  const keys = new Map<string, number>();
  const explicit = new Map<string, number>();
  out.forEach((n, i) => {
    const key = upsertKey(n.session);
    const prevKey = keys.get(key);
    if (prevKey !== undefined) {
      throw new McpToolError(`sessions[${i}] is the same session twice: same date, sport, title and athlete as sessions[${prevKey}]. Merge them or change a title.`);
    }
    keys.set(key, i);
    if (!n.explicitId) return;
    const prev = explicit.get(n.session.id);
    if (prev !== undefined) throw new McpToolError(`sessions[${i}] has the same id as sessions[${prev}] (${n.session.id}).`);
    explicit.set(n.session.id, i);
  });
  const taken = new Set(explicit.keys());
  return out.map((n) => {
    if (n.explicitId) return n;
    const id = uniqueId(n.session.id, taken, n.session.athletes[0]);
    return id === n.session.id ? n : { ...n, session: { ...n.session, id } };
  });
}

/** "both" for shared rows, else the single slug (or a comma list). */
export function athleteLabel(athletes: AthleteSlug[]): string {
  const set = new Set(athletes);
  if (set.size === 0 || ATHLETE_SLUGS.every((a) => set.has(a))) return "both";
  return [...set].join(",");
}

/** Snake-case, LLM-friendly view of a plan row. */
export function compactPlanSession(s: PlanSession) {
  return {
    id: s.id,
    date: s.date,
    sport: s.sport,
    title: s.title,
    detail: s.detail,
    target_min: s.targetMin,
    target_km: s.targetKm,
    athlete: athleteLabel(s.athletes),
    phase: s.phase,
    week: s.week,
  };
}

/** `base`, or `base-<suffix>`, `base-<suffix>-2`, ... whichever is not taken. Adds the result to `taken`. */
export function uniqueId(base: string, taken: Set<string>, suffix?: string): string {
  let id = base;
  if (taken.has(id) && suffix) id = `${base}-${suffix}`;
  const stem = id;
  for (let n = 2; taken.has(id); n += 1) id = `${stem}-${n}`;
  taken.add(id);
  return id;
}

/** The athletes other than `athlete` that a row applies to. */
function othersOn(row: PlanSession, athlete: AthleteSlug): AthleteSlug[] {
  const list = row.athletes.length === 0 ? ATHLETE_SLUGS : row.athletes;
  return list.filter((a) => a !== athlete);
}

/* ------------------------------------------------------------------ */
/* Upsert                                                               */
/* ------------------------------------------------------------------ */

export interface UpsertPlan {
  creates: PlanSession[];
  updates: PlanChange[];
  unchanged: PlanSession[];
}

function upsertKey(s: PlanSession): string {
  return `${s.date}|${s.sport}|${slug(s.title)}|${athleteLabel(s.athletes)}`;
}

/**
 * Create-or-update without deleting anything. A session with an explicit id
 * updates that row (and may move it to another date). Without an id it
 * updates the existing row with the same date, sport, title and athletes, or
 * else is created under the derived id, suffixed when that id already
 * belongs to a different row (for example the same title for the other
 * athlete). `existing` must contain every row on the incoming dates plus any
 * row named by an explicit id.
 */
export function planUpsertDiff(incoming: NormalizedInput[], existing: PlanSession[]): UpsertPlan {
  const byId = new Map(existing.map((s) => [s.id, s] as const));
  const byKey = new Map(existing.map((s) => [upsertKey(s), s] as const));
  const taken = new Set(existing.map((s) => s.id));
  const claimed = new Set<string>();
  const result: UpsertPlan = { creates: [], updates: [], unchanged: [] };

  for (const { session, explicitId } of incoming) {
    let before: PlanSession | undefined;
    if (explicitId) {
      before = byId.get(session.id);
    } else {
      const keyed = byKey.get(upsertKey(session));
      if (keyed && !claimed.has(keyed.id)) before = keyed;
    }
    if (before) {
      claimed.add(before.id);
      const after = { ...session, id: before.id };
      const fields = changedFields(before, after);
      if (fields.length === 0) result.unchanged.push(before);
      else result.updates.push({ before, after, fields });
      continue;
    }
    const id = explicitId ? session.id : uniqueId(session.id, taken, session.athletes[0]);
    taken.add(id);
    result.creates.push({ ...session, id });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Replace a date range                                                 */
/* ------------------------------------------------------------------ */

export interface Narrowing {
  /** The shared row as it is now. */
  before: PlanSession;
  /** Same row, now only for the other athlete. */
  after: PlanSession;
}

export interface ReplacePlan {
  scope: { from: string; to: string; athlete: AthleteChoice };
  creates: PlanSession[];
  updates: PlanChange[];
  /** Shared rows kept for the other athlete only. */
  narrows: Narrowing[];
  deletes: PlanSession[];
  unchanged: number;
}

/**
 * What it takes to make `athlete`'s plan for [from, to] exactly `incoming`.
 * `existing` is every row in the range (any athlete). Matching reuses
 * diffPlan: by id, then by date + sport + title, then a lone same-sport
 * session on the same day, so re-sending a lightly edited week updates rows
 * in place instead of churning ids.
 *
 * athlete "both": every row in the range is a candidate; unmatched rows are
 * deleted. A single athlete: only rows that apply to them are candidates,
 * incoming sessions are pinned to them, and a shared row that changes or
 * disappears is narrowed to the other athlete (who keeps it) while the new
 * version is created for this athlete.
 */
export function replaceRangeDiff(
  incoming: NormalizedInput[],
  existing: PlanSession[],
  scope: { from: string; to: string; athlete: AthleteChoice },
): ReplacePlan {
  const { from, to, athlete } = scope;
  incoming.forEach(({ session }, i) => {
    if (session.date < from || session.date > to) {
      throw new McpToolError(`sessions[${i}].date ${session.date} is outside the range being replaced (${from} to ${to}).`);
    }
  });
  const inRange = existing.filter((s) => s.date >= from && s.date <= to);
  const taken = new Set(existing.map((s) => s.id));
  const plan: ReplacePlan = { scope, creates: [], updates: [], narrows: [], deletes: [], unchanged: 0 };
  const sessions = incoming.map((n) => n.session);

  if (athlete === "both") {
    const diff = diffPlan(sessions, inRange, { scope: "all" });
    const removedIds = new Set(diff.removed.map((s) => s.id));
    const explicit = new Set(incoming.filter((n) => n.explicitId).map((n) => n.session.id));
    for (const s of diff.added) {
      // Reusing the id of a row this call deletes is fine: the upsert replaces
      // it. An explicit id is kept as given, so it can move a row in from
      // outside the range.
      const id = removedIds.has(s.id) || explicit.has(s.id) ? s.id : uniqueId(s.id, taken);
      taken.add(id);
      plan.creates.push({ ...s, id });
    }
    plan.updates = diff.changed;
    plan.unchanged = diff.unchanged;
    const written = new Set(plan.creates.map((s) => s.id));
    plan.deletes = diff.removed.filter((s) => !written.has(s.id));
    return plan;
  }

  const original = new Map(inRange.map((s) => [s.id, s] as const));
  const view = inRange.filter((s) => appliesTo(s, athlete)).map((s) => ({ ...s, athletes: [athlete] }));
  const diff = diffPlan(sessions, view, { scope: "all" });
  plan.unchanged = diff.unchanged;

  const narrow = (row: PlanSession) => {
    plan.narrows.push({ before: row, after: { ...row, athletes: othersOn(row, athlete) } });
  };
  const create = (s: PlanSession) => {
    const base = deriveId(s.date, s.sport, s.title);
    plan.creates.push({ ...s, id: uniqueId(base, taken, athlete) });
  };

  for (const s of diff.added) create(s);
  for (const change of diff.changed) {
    const row = original.get(change.before.id)!;
    if (othersOn(row, athlete).length > 0) {
      narrow(row);
      create(change.after);
    } else {
      plan.updates.push({ before: row, after: change.after, fields: change.fields });
    }
  }
  for (const v of diff.removed) {
    const row = original.get(v.id)!;
    if (othersOn(row, athlete).length > 0) narrow(row);
    else plan.deletes.push(row);
  }
  return plan;
}

/* ------------------------------------------------------------------ */
/* Delete                                                               */
/* ------------------------------------------------------------------ */

/**
 * Removing `rows` from `athlete`'s plan. For "both" every row is deleted;
 * for one athlete, rows that do not apply to them are left alone and shared
 * rows are narrowed to the other athlete.
 */
export function deletePlanScope(rows: PlanSession[], athlete: AthleteChoice): { deletes: PlanSession[]; narrows: Narrowing[]; skipped: PlanSession[] } {
  if (athlete === "both") return { deletes: rows, narrows: [], skipped: [] };
  const out = { deletes: [] as PlanSession[], narrows: [] as Narrowing[], skipped: [] as PlanSession[] };
  for (const row of rows) {
    if (!appliesTo(row, athlete)) out.skipped.push(row);
    else if (othersOn(row, athlete).length > 0) out.narrows.push({ before: row, after: { ...row, athletes: othersOn(row, athlete) } });
    else out.deletes.push(row);
  }
  return out;
}
