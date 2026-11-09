import { db } from "../training/db";
import type { AthleteSlug, PlanSession, Sport } from "../training/types";

/**
 * Server-only access to `training.plan_sessions`, the training program.
 * Reads go through `getPlan()` in lib/training/plan.ts (cached, tagged);
 * writes come from the admin plan import and the seed script. The client in
 * db.ts is pinned to the `training` schema, so `.from("plan_sessions")`
 * resolves to `training.plan_sessions`.
 */

/** Row shape of `training.plan_sessions`. */
export interface PlanSessionRow {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  sport: Sport;
  title: string;
  detail: string | null;
  target_min: number | null;
  /** Postgres `numeric` comes back as a string. */
  target_km: number | string | null;
  athletes: string[] | null;
  phase: string | null;
  week: number;
  updated_at: string;
}

/** Columns we write; `updated_at` is set by the caller. */
export type PlanSessionInsert = Omit<PlanSessionRow, "updated_at"> & {
  updated_at?: string;
};

const PLAN_COLUMNS = "id, date, sport, title, detail, target_min, target_km, athletes, phase, week, updated_at";

/** Postgres `numeric` comes back as a string; normalise to a number. */
function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toPlanSession(row: PlanSessionRow): PlanSession {
  return {
    id: row.id,
    date: row.date,
    sport: row.sport,
    title: row.title,
    detail: row.detail,
    targetMin: num(row.target_min),
    targetKm: num(row.target_km),
    athletes: Array.isArray(row.athletes) ? (row.athletes as AthleteSlug[]) : [],
    phase: row.phase,
    week: row.week,
  };
}

export function toPlanSessionRow(session: PlanSession): PlanSessionInsert {
  return {
    id: session.id,
    date: session.date,
    sport: session.sport,
    title: session.title,
    detail: session.detail,
    target_min: session.targetMin,
    target_km: session.targetKm,
    athletes: session.athletes,
    phase: session.phase,
    week: session.week,
    updated_at: new Date().toISOString(),
  };
}

/** Same ordering as validatePlan: by date, then id. */
export function sortPlan(sessions: PlanSession[]): PlanSession[] {
  return [...sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Every session in the program, sorted by date then id. `from` / `to`
 * (inclusive, YYYY-MM-DD) narrow it to a date range.
 */
export async function listPlanSessions(range: { from?: string; to?: string } = {}): Promise<PlanSession[]> {
  let q = db()
    .from("plan_sessions")
    .select(PLAN_COLUMNS)
    .order("date")
    .order("id");
  if (range.from) q = q.gte("date", range.from);
  if (range.to) q = q.lte("date", range.to);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as PlanSessionRow[]).map(toPlanSession);
}

/** The sessions with these ids (missing ids are simply absent), sorted by date then id. */
export async function getPlanSessionsByIds(ids: string[]): Promise<PlanSession[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db()
    .from("plan_sessions")
    .select(PLAN_COLUMNS)
    .in("id", ids)
    .order("date")
    .order("id");
  if (error) throw error;
  return ((data ?? []) as unknown as PlanSessionRow[]).map(toPlanSession);
}

export interface PlanStats {
  count: number;
  /** Earliest and latest session dates, null when the table is empty. */
  from: string | null;
  to: string | null;
  /** Most recent `updated_at`, ISO string, null when the table is empty. */
  updatedAt: string | null;
}

/** Counts and bounds for the admin header; one small query. */
export async function planStats(): Promise<PlanStats> {
  const { data, error } = await db().from("plan_sessions").select("date, updated_at");
  if (error) throw error;
  const rows = (data ?? []) as { date: string; updated_at: string }[];
  let from: string | null = null;
  let to: string | null = null;
  let updatedAt: string | null = null;
  for (const r of rows) {
    if (from === null || r.date < from) from = r.date;
    if (to === null || r.date > to) to = r.date;
    if (updatedAt === null || r.updated_at > updatedAt) updatedAt = r.updated_at;
  }
  return { count: rows.length, from, to, updatedAt };
}

const CHUNK = 200;

/** Insert or replace by id. Returns the number of rows written. */
export async function upsertPlanSessions(rows: PlanSession[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK).map(toPlanSessionRow);
    const { error } = await db().from("plan_sessions").upsert(slice, { onConflict: "id" });
    if (error) throw error;
    written += slice.length;
  }
  return written;
}

/** Delete by id. Returns the number of ids requested (missing ids are not an error). */
export async function deletePlanSessions(ids: string[]): Promise<number> {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { error } = await db().from("plan_sessions").delete().in("id", slice);
    if (error) throw error;
  }
  return ids.length;
}
