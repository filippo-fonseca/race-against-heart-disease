/**
 * Pure aggregations over activities and the plan for the charts and the
 * headline numerals. Everything keys on YYYY-MM-DD strings; weeks start on
 * Monday. No Date objects in local time anywhere.
 */

import type { Activity, AthleteSlug, PlanSession, Sport, TrainingSummary, WeeklyTotals } from "./types";
import { appliesTo } from "./plan";
import { addDays, eachDay, type ISODate, todayISO, weekStartOf } from "./dates";

export const SPORTS: readonly Sport[] = ["swim", "bike", "run", "strength", "other"];

type SportBucket = { timeSec: number; distanceM: number; count: number };

export function emptyBySport(): Record<Sport, SportBucket> {
  return {
    swim: { timeSec: 0, distanceM: 0, count: 0 },
    bike: { timeSec: 0, distanceM: 0, count: 0 },
    run: { timeSec: 0, distanceM: 0, count: 0 },
    strength: { timeSec: 0, distanceM: 0, count: 0 },
    other: { timeSec: 0, distanceM: 0, count: 0 },
  };
}

function addTo(bucket: Record<Sport, SportBucket>, a: Activity): void {
  const b = bucket[a.sport];
  b.timeSec += a.movingTimeSec;
  b.distanceM += a.distanceM;
  b.count += 1;
}

function forAthlete(activities: Activity[], athlete: AthleteSlug): Activity[] {
  return activities.filter((a) => a.athlete === athlete);
}

/* ------------------------------------------------------------------ */
/* Weekly totals                                                       */
/* ------------------------------------------------------------------ */

export interface WeeklyTotalsOptions {
  /** Clamp the weeks returned. Defaults to every week touched by the plan or the activities. */
  from?: ISODate;
  to?: ISODate;
}

/**
 * One row per Monday-start week, in order, covering every week that has
 * either an activity or a planned session for the athlete. Weeks in between
 * with nothing are included as zero rows so charts stay contiguous.
 */
export function weeklyTotals(activities: Activity[], plan: PlanSession[], athlete: AthleteSlug, opts: WeeklyTotalsOptions = {}): WeeklyTotals[] {
  const acts = forAthlete(activities, athlete);
  const sessions = plan.filter((s) => appliesTo(s, athlete));

  const dates = [...acts.map((a) => a.date), ...sessions.map((s) => s.date)];
  if (opts.from) dates.push(opts.from);
  if (opts.to) dates.push(opts.to);
  if (dates.length === 0) return [];

  let first = weekStartOf(dates.reduce((a, b) => (a < b ? a : b)));
  let last = weekStartOf(dates.reduce((a, b) => (a > b ? a : b)));
  if (opts.from) first = weekStartOf(opts.from) > first ? weekStartOf(opts.from) : first;
  if (opts.to) last = weekStartOf(opts.to) < last ? weekStartOf(opts.to) : last;

  const rows = new Map<ISODate, WeeklyTotals>();
  for (let ws = first; ws <= last; ws = addDays(ws, 7)) {
    rows.set(ws, { weekStart: ws, athlete, bySport: emptyBySport(), totalTimeSec: 0, plannedTimeSec: 0 });
  }

  for (const a of acts) {
    const row = rows.get(weekStartOf(a.date));
    if (!row) continue;
    addTo(row.bySport, a);
    row.totalTimeSec += a.movingTimeSec;
  }
  for (const s of sessions) {
    const row = rows.get(weekStartOf(s.date));
    if (!row) continue;
    row.plannedTimeSec += (s.targetMin ?? 0) * 60;
  }
  return [...rows.values()];
}

/** Planned seconds per sport for one week, for the "vs plan" overlay. */
export function plannedBySport(plan: PlanSession[], weekStart: ISODate, athlete: AthleteSlug): Record<Sport, number> {
  const out: Record<Sport, number> = { swim: 0, bike: 0, run: 0, strength: 0, other: 0 };
  const end = addDays(weekStart, 6);
  for (const s of plan) {
    if (s.date < weekStart || s.date > end || !appliesTo(s, athlete)) continue;
    out[s.sport] += (s.targetMin ?? 0) * 60;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Summary and streak                                                  */
/* ------------------------------------------------------------------ */

/**
 * Consecutive days with at least one activity, counting back from `today`.
 * A day without activity ends the streak, except today itself: an empty today
 * does not break a streak that ran through yesterday, since the day is not over.
 */
export function streakDays(activities: Activity[], today: ISODate = todayISO()): number {
  const days = new Set(activities.map((a) => a.date));
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function summary(activities: Activity[], athlete: AthleteSlug, since: ISODate, today: ISODate = todayISO()): TrainingSummary {
  const acts = forAthlete(activities, athlete).filter((a) => a.date >= since && a.date <= today);
  const bySport = emptyBySport();
  let totalTimeSec = 0;
  let totalDistanceM = 0;
  for (const a of acts) {
    addTo(bySport, a);
    totalTimeSec += a.movingTimeSec;
    totalDistanceM += a.distanceM;
  }
  return {
    athlete,
    since,
    totalTimeSec,
    totalDistanceM,
    sessions: acts.length,
    streakDays: streakDays(acts, today),
    bySport,
  };
}

/* ------------------------------------------------------------------ */
/* Calendar heatmap                                                    */
/* ------------------------------------------------------------------ */

export interface CalendarCell {
  date: ISODate;
  timeSec: number;
  /** Sports logged that day, in the order they occurred, deduplicated. */
  sports: Sport[];
  count: number;
}

/** One cell per day from `from` to `to` inclusive. Pass pre-filtered activities or an athlete. */
export function calendarCells(activities: Activity[], from: ISODate, to: ISODate, athlete?: AthleteSlug): CalendarCell[] {
  const acts = athlete ? forAthlete(activities, athlete) : activities;
  const byDate = new Map<ISODate, Activity[]>();
  for (const a of acts) {
    if (a.date < from || a.date > to) continue;
    byDate.set(a.date, [...(byDate.get(a.date) ?? []), a]);
  }
  return eachDay(from, to).map((date) => {
    const list = (byDate.get(date) ?? []).slice().sort((a, b) => a.startLocal.localeCompare(b.startLocal));
    const sports: Sport[] = [];
    for (const a of list) if (!sports.includes(a.sport)) sports.push(a.sport);
    return { date, timeSec: list.reduce((n, a) => n + a.movingTimeSec, 0), sports, count: list.length };
  });
}

/* ------------------------------------------------------------------ */
/* Heart rate histogram                                                */
/* ------------------------------------------------------------------ */

export interface HrBucket {
  /** Inclusive lower bound, bpm. */
  from: number;
  /** Exclusive upper bound, bpm. */
  to: number;
  label: string;
  /** Activities whose average HR falls in the bucket. */
  count: number;
  /** Moving time of those activities, so the chart can weight by duration. */
  timeSec: number;
}

export interface HrBucketOptions {
  width?: number;
  /** Clamp the range. Defaults to the data, rounded out to the bucket width. */
  min?: number;
  max?: number;
}

/** Histogram of average heart rate across activities that have one. */
export function hrBuckets(activities: Activity[], opts: HrBucketOptions = {}): HrBucket[] {
  const width = opts.width ?? 10;
  const withHr = activities.filter((a): a is Activity & { avgHr: number } => a.avgHr != null && a.avgHr > 0);
  if (withHr.length === 0) return [];

  const lo = opts.min ?? Math.floor(Math.min(...withHr.map((a) => a.avgHr)) / width) * width;
  const hi = opts.max ?? Math.floor(Math.max(...withHr.map((a) => a.avgHr)) / width) * width + width;

  const buckets: HrBucket[] = [];
  for (let from = lo; from < hi; from += width) {
    buckets.push({ from, to: from + width, label: `${from}-${from + width - 1}`, count: 0, timeSec: 0 });
  }
  for (const a of withHr) {
    const idx = Math.floor((a.avgHr - lo) / width);
    const b = buckets[Math.min(Math.max(idx, 0), buckets.length - 1)];
    b.count += 1;
    b.timeSec += a.movingTimeSec;
  }
  return buckets;
}

/* ------------------------------------------------------------------ */
/* Cumulative distance                                                 */
/* ------------------------------------------------------------------ */

export interface CumulativePoint {
  date: ISODate;
  /** Running total of distance in meters for the sport (or all sports). */
  distanceM: number;
}

/** Running distance total by day, for the "multiples of 70.3" chart. */
export function cumulativeDistance(activities: Activity[], from: ISODate, to: ISODate, sport?: Sport): CumulativePoint[] {
  const byDate = new Map<ISODate, number>();
  for (const a of activities) {
    if (a.date < from || a.date > to) continue;
    if (sport && a.sport !== sport) continue;
    byDate.set(a.date, (byDate.get(a.date) ?? 0) + a.distanceM);
  }
  let running = 0;
  return eachDay(from, to).map((date) => {
    running += byDate.get(date) ?? 0;
    return { date, distanceM: running };
  });
}
