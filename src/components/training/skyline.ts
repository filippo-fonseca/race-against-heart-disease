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

/** A photo from Strava (or added through the bot) for a callout card. */
export interface SkylinePhoto {
  url: string;
  alt: string;
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
  /** The day's first photo, when it has one. */
  photo: SkylinePhoto | null;
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
    let photo: SkylinePhoto | null = null;
    for (const a of acts) {
      const p = a.photos.find((x) => x.url);
      if (!photo && p) photo = { url: p.url, alt: p.caption ?? `${a.name}, photo` };
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
      photo,
    });
  }
  return days;
}

/** Total minutes across sports for one day. */
export function totalMinutes(d: Pick<SkylineDay, "minutes">): number {
  return SPORTS.reduce((n, s) => n + d.minutes[s], 0);
}

/**
 * Days to call out on the skyline: up to `count` trained days, picked at
 * random with `rand` (Math.random in the browser). Days with a photo come
 * first so the callouts show pictures whenever there are any.
 */
export function pickCallouts(days: SkylineDay[], count: number, rand: () => number = Math.random): number[] {
  const shuffle = (xs: number[]) => {
    const a = xs.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const trained = days.map((d, i) => (d.sessions.length > 0 ? i : -1)).filter((i) => i >= 0);
  const withPhoto = trained.filter((i) => days[i].photo);
  const without = trained.filter((i) => !days[i].photo);
  return [...shuffle(withPhoto), ...shuffle(without)].slice(0, count).sort((a, b) => a - b);
}

/** Three-letter weekday names for the grid rows, Monday first. */
export const WEEKDAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
