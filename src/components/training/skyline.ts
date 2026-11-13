/**
 * Data for the 3D training skyline: one entry per day of the window (day 1,
 * Nov 2, to race day), with minutes per sport and the day's sessions. Pure,
 * so it can be built on the server and tested.
 */

import { addDays, dayNumber, weekdayIndex, type ISODate } from "@/lib/training/dates";
import { SPORTS, bucketOf, type Activity, type SportBucket } from "@/lib/training/types";

export interface SkylineSession {
  name: string;
  sport: SportBucket;
  minutes: number;
}

export interface SkylineDay {
  date: ISODate;
  /** Day number in the window, 1 to N. */
  day: number;
  /** Column: week of the window, 0-based. */
  week: number;
  /** Row: 0 = Monday ... 6 = Sunday. */
  weekday: number;
  /** Minutes trained per sport bucket. */
  minutes: Record<SportBucket, number>;
  sessions: SkylineSession[];
  /** "past", "today" or "future", relative to today. */
  when: "past" | "today" | "future";
  /** Feed link for trained days. */
  href: string | null;
}

function zero(): Record<SportBucket, number> {
  return { swim: 0, bike: 0, run: 0, strength: 0 };
}

export function buildSkyline(opts: {
  activities: Activity[];
  start: ISODate;
  totalDays: number;
  today: ISODate;
  links: Map<string, string>;
}): SkylineDay[] {
  const byDate = new Map<string, Activity[]>();
  for (const a of opts.activities) {
    const list = byDate.get(a.date) ?? [];
    list.push(a);
    byDate.set(a.date, list);
  }
  const startWeekday = weekdayIndex(opts.start);
  const days: SkylineDay[] = [];
  for (let i = 0; i < opts.totalDays; i++) {
    const date = addDays(opts.start, i);
    const acts = (byDate.get(date) ?? []).slice().sort((a, b) => a.startLocal.localeCompare(b.startLocal));
    const minutes = zero();
    const sessions: SkylineSession[] = [];
    for (const a of acts) {
      const sport = bucketOf(a.sport);
      const m = a.movingTimeSec / 60;
      minutes[sport] += m;
      sessions.push({ name: a.name, sport, minutes: Math.round(m) });
    }
    const offset = i + startWeekday;
    days.push({
      date,
      day: dayNumber(date),
      week: Math.floor(offset / 7),
      weekday: offset % 7,
      minutes,
      sessions,
      when: date < opts.today ? "past" : date === opts.today ? "today" : "future",
      href: opts.links.get(date) ?? null,
    });
  }
  return days;
}

/** Total minutes across sports for one day. */
export function totalMinutes(d: Pick<SkylineDay, "minutes">): number {
  return SPORTS.reduce((n, s) => n + d.minutes[s], 0);
}
