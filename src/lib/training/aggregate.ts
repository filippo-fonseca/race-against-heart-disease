/**
 * Pure aggregations over Strava activities for the charts and the headline
 * numerals. Everything is retroactive: only what was logged counts. Keys are
 * YYYY-MM-DD strings; weeks start on Monday. No Date objects in local time.
 * Callers pass the activities to count (the site shows only Filippo's).
 */

import { SPORTS, bucketOf, type Activity, type SportBucket, type TrainingSummary, type WeeklyTotals } from "./types";
import { addDays, eachDay, type ISODate, todayISO, weekStartOf } from "./dates";

export type SportTotals = { timeSec: number; distanceM: number; count: number };

export function emptyBySport(): Record<SportBucket, SportTotals> {
  return {
    swim: { timeSec: 0, distanceM: 0, count: 0 },
    bike: { timeSec: 0, distanceM: 0, count: 0 },
    run: { timeSec: 0, distanceM: 0, count: 0 },
    strength: { timeSec: 0, distanceM: 0, count: 0 },
  };
}

function addTo(bucket: Record<SportBucket, SportTotals>, a: Activity): void {
  const b = bucket[bucketOf(a.sport)];
  b.timeSec += a.movingTimeSec;
  b.distanceM += a.distanceM;
  b.count += 1;
}

/** Per-sport totals over a list of activities. */
export function totalsBySport(activities: Activity[]): Record<SportBucket, SportTotals> {
  const out = emptyBySport();
  for (const a of activities) addTo(out, a);
  return out;
}

/* ------------------------------------------------------------------ */
/* Weekly totals                                                       */
/* ------------------------------------------------------------------ */

export interface WeeklyTotalsOptions {
  /** Clamp the weeks returned. Defaults to every week touched by the activities. */
  from?: ISODate;
  to?: ISODate;
}

/**
 * One row per Monday-start week, in order, covering every week from the first
 * to the last activity (or the clamped range). Weeks with nothing are zero
 * rows so charts stay contiguous.
 */
export function weeklyTotals(activities: Activity[], opts: WeeklyTotalsOptions = {}): WeeklyTotals[] {
  const dates = activities.map((a) => a.date);
  if (opts.from) dates.push(opts.from);
  if (opts.to) dates.push(opts.to);
  if (dates.length === 0) return [];

  let first = weekStartOf(dates.reduce((a, b) => (a < b ? a : b)));
  let last = weekStartOf(dates.reduce((a, b) => (a > b ? a : b)));
  if (opts.from) first = weekStartOf(opts.from) > first ? weekStartOf(opts.from) : first;
  if (opts.to) last = weekStartOf(opts.to) < last ? weekStartOf(opts.to) : last;

  const rows = new Map<ISODate, WeeklyTotals>();
  for (let ws = first; ws <= last; ws = addDays(ws, 7)) {
    rows.set(ws, { weekStart: ws, bySport: emptyBySport(), totalTimeSec: 0 });
  }

  for (const a of activities) {
    const row = rows.get(weekStartOf(a.date));
    if (!row) continue;
    addTo(row.bySport, a);
    row.totalTimeSec += a.movingTimeSec;
  }
  return [...rows.values()];
}

/* ------------------------------------------------------------------ */
/* Summary, active days and rest days                                  */
/* ------------------------------------------------------------------ */

/**
 * Days with at least one activity, and days without, from `since` through
 * `today`. Today counts as a rest day only once it is over, so an empty today
 * is left out of both until something is logged.
 */
export function activeAndRestDays(
  activities: Activity[],
  since: ISODate,
  today: ISODate = todayISO(),
): { activeDays: number; restDays: number } {
  const days = new Set(activities.filter((a) => a.date >= since && a.date <= today).map((a) => a.date));
  const activeDays = days.size;
  const through = days.has(today) ? today : addDays(today, -1);
  const elapsed = eachDay(since, through).length;
  return { activeDays, restDays: Math.max(0, elapsed - activeDays) };
}

/** Totals from `since` through `today`, both included. */
export function summary(activities: Activity[], since: ISODate, today: ISODate = todayISO()): TrainingSummary {
  const acts = activities.filter((a) => a.date >= since && a.date <= today);
  let totalTimeSec = 0;
  let totalDistanceM = 0;
  for (const a of acts) {
    totalTimeSec += a.movingTimeSec;
    totalDistanceM += a.distanceM;
  }
  return {
    since,
    totalTimeSec,
    totalDistanceM,
    sessions: acts.length,
    ...activeAndRestDays(acts, since, today),
    bySport: totalsBySport(acts),
  };
}

/* ------------------------------------------------------------------ */
/* Calendar heatmap                                                    */
/* ------------------------------------------------------------------ */

export interface CalendarCell {
  date: ISODate;
  timeSec: number;
  /** Sports logged that day, in the order they occurred, deduplicated. */
  sports: SportBucket[];
  count: number;
}

/** One cell per day from `from` to `to` inclusive. */
export function calendarCells(activities: Activity[], from: ISODate, to: ISODate): CalendarCell[] {
  const byDate = new Map<ISODate, Activity[]>();
  for (const a of activities) {
    if (a.date < from || a.date > to) continue;
    byDate.set(a.date, [...(byDate.get(a.date) ?? []), a]);
  }
  return eachDay(from, to).map((date) => {
    const list = (byDate.get(date) ?? []).slice().sort((a, b) => a.startLocal.localeCompare(b.startLocal));
    const sports: SportBucket[] = [];
    for (const a of list) {
      const b = bucketOf(a.sport);
      if (!sports.includes(b)) sports.push(b);
    }
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
/* Cumulative time                                                     */
/* ------------------------------------------------------------------ */

/**
 * Running moving-time total per sport, one value per day from `from` to `to`
 * inclusive (index 0 is `from`). Time, not distance, so indoor rides count.
 */
export function cumulativeTime(activities: Activity[], from: ISODate, to: ISODate): Record<SportBucket, number[]> {
  const days = eachDay(from, to);
  const index = new Map(days.map((d, i) => [d, i]));
  const perDay = Object.fromEntries(SPORTS.map((s) => [s, new Array<number>(days.length).fill(0)])) as Record<SportBucket, number[]>;
  for (const a of activities) {
    const i = index.get(a.date);
    if (i === undefined) continue;
    perDay[bucketOf(a.sport)][i] += a.movingTimeSec;
  }
  for (const s of SPORTS) {
    let acc = 0;
    perDay[s] = perDay[s].map((sec) => (acc += sec));
  }
  return perDay;
}
