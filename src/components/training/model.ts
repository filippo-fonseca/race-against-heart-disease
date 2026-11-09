/**
 * View-model builders. Pure functions from the contract types in
 * src/lib/training/types.ts to the shapes the charts and the feed render.
 * Everything is retroactive: built only from logged Strava activities.
 */

import { SPORTS, type Activity, type SportBucket, type WeeklyTotals } from "@/lib/training/types";
import { TRAINING_WEEKS, weekNumber, weekStartFor } from "@/lib/training/dates";

/** One week of the window with its logged time per sport. */
export interface WeekSlot {
  week: number;
  weekStart: string;
  bySportSec: Record<SportBucket, number>;
  totalSec: number;
}

function zeroBySport(): Record<SportBucket, number> {
  return { swim: 0, bike: 0, run: 0, strength: 0 };
}

/** Every week of the window (1 to 22), filled from `weekly`. Weeks with nothing are zero. */
export function buildWeekSlots(weekly: WeeklyTotals[]): WeekSlot[] {
  const slots: WeekSlot[] = [];
  for (let w = 1; w <= TRAINING_WEEKS; w++) {
    const weekStart = weekStartFor(w);
    const bySportSec = zeroBySport();
    let totalSec = 0;
    for (const t of weekly) {
      if (t.weekStart !== weekStart) continue;
      for (const s of SPORTS) bySportSec[s] += t.bySport[s].timeSec;
      totalSec += t.totalTimeSec;
    }
    slots.push({ week: w, weekStart, bySportSec, totalSec });
  }
  return slots;
}

/** Minutes trained per calendar day. */
export function minutesByDate(activities: Activity[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of activities) out.set(a.date, (out.get(a.date) ?? 0) + a.movingTimeSec / 60);
  return out;
}

/** One day of the feed: its activities, newest first. */
export interface FeedDay {
  date: string;
  activities: Activity[];
}

/** One week of the feed. Only days with activities appear; empty weeks are left out. */
export interface FeedWeek {
  week: number;
  weekStart: string;
  days: FeedDay[];
  totalSec: number;
}

/** Group activities into weeks and days, newest first at every level. */
export function buildFeed(activities: Activity[]): FeedWeek[] {
  const weeks = new Map<number, FeedWeek>();
  const days = new Map<string, FeedDay>();
  const sorted = activities.slice().sort((a, b) => b.startLocal.localeCompare(a.startLocal));
  for (const a of sorted) {
    const w = weekNumber(a.date);
    let week = weeks.get(w);
    if (!week) {
      week = { week: w, weekStart: weekStartFor(w), days: [], totalSec: 0 };
      weeks.set(w, week);
    }
    let day = days.get(a.date);
    if (!day) {
      day = { date: a.date, activities: [] };
      days.set(a.date, day);
      week.days.push(day);
    }
    day.activities.push(a);
    week.totalSec += a.movingTimeSec;
  }
  for (const week of weeks.values()) week.days.sort((a, b) => b.date.localeCompare(a.date));
  return [...weeks.values()].sort((a, b) => b.week - a.week);
}

/** Avg-HR histogram weighted by moving minutes. Bins are [lo, lo + step). */
export function hrBins(activities: Activity[], lo = 90, hi = 190, step = 10): { lo: number; minutes: number }[] {
  const bins = Array.from({ length: (hi - lo) / step }, (_, i) => ({ lo: lo + i * step, minutes: 0 }));
  for (const a of activities) {
    if (a.avgHr == null) continue;
    const idx = Math.min(bins.length - 1, Math.max(0, Math.floor((a.avgHr - lo) / step)));
    bins[idx].minutes += a.movingTimeSec / 60;
  }
  return bins;
}
