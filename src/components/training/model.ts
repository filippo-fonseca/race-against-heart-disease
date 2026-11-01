/**
 * View-model builders. Pure functions from the contract types in
 * src/lib/training/types.ts to the shapes the charts and log render.
 * These are UI concerns and stay put when the data source changes.
 */

import type { Activity, DayMatch, PlanSession, Sport, WeeklyTotals } from "@/lib/training/types";

export type AthleteFilter = "filippo" | "emir" | "both";

export const SPORTS: Sport[] = ["swim", "bike", "run", "strength", "other"];

/** One program week, with the plan and every selected athlete's actuals rolled together. */
export interface WeekSlot {
  week: number;
  weekStart: string;
  phase: string | null;
  bySportSec: Record<Sport, number>;
  totalSec: number;
  plannedSec: number;
}

function zeroBySport(): Record<Sport, number> {
  return { swim: 0, bike: 0, run: 0, strength: 0, other: 0 };
}

/**
 * Lay out every week of the program, filling actuals from `weekly` (one or more
 * athletes) and the plan from `plan`. `weekStartFor(week)` maps a 1-based week
 * to its Monday; `athleteCount` scales planned time when several athletes are shown.
 */
export function buildWeekSlots(
  plan: PlanSession[],
  weekly: WeeklyTotals[],
  totalWeeks: number,
  weekStartFor: (week: number) => string,
  athleteCount: number,
): WeekSlot[] {
  const slots: WeekSlot[] = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const weekStart = weekStartFor(w);
    const sessions = plan.filter((p) => p.week === w);
    const plannedSec = sessions.reduce((s, p) => s + (p.targetMin ?? 0) * 60, 0) * athleteCount;
    const bySportSec = zeroBySport();
    let totalSec = 0;
    for (const t of weekly) {
      if (t.weekStart !== weekStart) continue;
      for (const s of SPORTS) bySportSec[s] += t.bySport[s].timeSec;
      totalSec += t.totalTimeSec;
    }
    slots.push({
      week: w,
      weekStart,
      phase: sessions[0]?.phase ?? null,
      bySportSec,
      totalSec,
      plannedSec,
    });
  }
  return slots;
}

/** Minutes trained per calendar day, all selected athletes combined. */
export function minutesByDate(matches: DayMatch[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of matches) {
    const sec = m.actual.reduce((s, a) => s + a.movingTimeSec, 0);
    out.set(m.date, (out.get(m.date) ?? 0) + sec / 60);
  }
  return out;
}

/** A week of the log: every athlete's day matches for that week, newest day first. */
export interface WeekGroup {
  week: number;
  weekStart: string;
  phase: string | null;
  /** Each entry is one date; inside, one DayMatch per selected athlete. */
  days: { date: string; perAthlete: DayMatch[] }[];
  actualSec: number;
  plannedSec: number;
}

export function groupByWeek(
  matches: DayMatch[],
  weekNumberOf: (date: string) => number,
  weekStartOf: (date: string) => string,
  phaseForWeek: (week: number) => string | null,
  athleteCount: number,
): WeekGroup[] {
  const weeks = new Map<number, WeekGroup>();
  const dayIndex = new Map<string, DayMatch[]>();
  for (const m of matches) {
    const w = weekNumberOf(m.date);
    let g = weeks.get(w);
    if (!g) {
      g = {
        week: w,
        weekStart: weekStartOf(m.date),
        phase: phaseForWeek(w),
        days: [],
        actualSec: 0,
        plannedSec: 0,
      };
      weeks.set(w, g);
    }
    let per = dayIndex.get(m.date);
    if (!per) {
      per = [];
      dayIndex.set(m.date, per);
      g.days.push({ date: m.date, perAthlete: per });
    }
    per.push(m);
    g.actualSec += m.actual.reduce((s, a) => s + a.movingTimeSec, 0);
  }
  // Planned time is per athlete; count each session once per selected athlete.
  for (const g of weeks.values()) {
    const seen = new Set<string>();
    for (const d of g.days) {
      for (const m of d.perAthlete) {
        for (const p of m.planned) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          g.plannedSec += (p.targetMin ?? 0) * 60 * athleteCount;
        }
      }
    }
    g.days.sort((a, b) => b.date.localeCompare(a.date));
  }
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
