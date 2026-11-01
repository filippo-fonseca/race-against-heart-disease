/**
 * Fixtures for the training log while the data layer (Strava → Supabase)
 * and the plan/matcher/aggregate math land. Everything here is deterministic
 * so screenshots and tests are stable.
 *
 * The inline math at the bottom (matchDays, weeklyTotals, summarize) mirrors
 * the import surface expected from matcher.ts and aggregate.ts. When those
 * ship, src/app/training/page.tsx swaps its imports and this file goes away.
 */

import type {
  Activity,
  ActivityPhoto,
  Athlete,
  AthleteSlug,
  DayMatch,
  MatchStatus,
  PlanSession,
  Sport,
  TrainingSummary,
  WeeklyTotals,
} from "./types";

/* ------------------------------------------------------------------ */
/* Calendar helpers (UTC date strings only, no timezone drift)         */
/* ------------------------------------------------------------------ */

export const PROGRAM_START = "2026-11-02"; // a Monday
export const RACE_DAY = "2027-04-04"; // a Sunday
/** The fixtures pretend it is this day: a Thursday in week 6. */
export const MOCK_TODAY = "2026-12-10";

const DAY_MS = 86_400_000;

export function toUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return fromUTC(new Date(toUTC(iso).getTime() + n * DAY_MS));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / DAY_MS);
}

/** Monday of the ISO week containing `iso`. */
export function weekStartOf(iso: string): string {
  const d = toUTC(iso);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(iso, -dow);
}

/** 1-based program week number for a date. */
export function weekNumberOf(iso: string): number {
  return Math.floor(daysBetween(PROGRAM_START, iso) / 7) + 1;
}

export const PROGRAM_WEEKS = Math.ceil((daysBetween(PROGRAM_START, RACE_DAY) + 1) / 7);

export function phaseForWeek(week: number): string {
  if (week <= 4) return "Base 1";
  if (week <= 8) return "Base 2";
  if (week <= 12) return "Build 1";
  if (week <= 16) return "Build 2";
  if (week <= 20) return "Peak";
  if (week <= 21) return "Taper";
  return "Race week";
}

/* ------------------------------------------------------------------ */
/* Seeded randomness                                                   */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Athletes                                                            */
/* ------------------------------------------------------------------ */

export const mockAthletes: Athlete[] = [
  { slug: "filippo", name: "Filippo", stravaId: 1001, avatarUrl: null },
  { slug: "amir", name: "Amir", stravaId: 1002, avatarUrl: null },
];

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

type Template = {
  dow: number; // 0 = Monday
  sport: Sport;
  title: string;
  detail: string | null;
  min: number;
  km: number | null;
};

/** Base weekly template; durations scale with the week's load factor. */
const weekTemplate: Template[] = [
  { dow: 0, sport: "strength", title: "Strength", detail: "Hinge, squat, pull, core. 3 rounds.", min: 40, km: null },
  { dow: 1, sport: "swim", title: "Swim technique", detail: "Drills + 8 × 100 steady", min: 45, km: 2.0 },
  { dow: 1, sport: "run", title: "Easy run", detail: "Z2, conversational", min: 40, km: 7 },
  { dow: 2, sport: "bike", title: "Bike intervals", detail: "4 × 8 min @ threshold, 3 min easy", min: 60, km: 28 },
  { dow: 3, sport: "swim", title: "Swim endurance", detail: "Continuous 1500 at race effort", min: 45, km: 2.2 },
  { dow: 3, sport: "strength", title: "Strength", detail: "Single-leg, hips, core", min: 30, km: null },
  { dow: 4, sport: "run", title: "Tempo run", detail: "3 × 10 min @ tempo, 2 min jog", min: 45, km: 9 },
  { dow: 5, sport: "bike", title: "Long ride", detail: "Z2, fuel every 20 min", min: 105, km: 52 },
  { dow: 6, sport: "run", title: "Long run", detail: "Z2, last 10 min steady", min: 65, km: 12 },
];

function loadFactor(week: number): number {
  // Gentle ramp with a lighter fourth week per block, long taper at the end.
  if (week >= PROGRAM_WEEKS) return 0.45;
  if (week === PROGRAM_WEEKS - 1) return 0.7;
  const inBlock = (week - 1) % 4;
  const block = Math.floor((week - 1) / 4);
  const base = 1 + block * 0.14;
  return inBlock === 3 ? base * 0.78 : base + inBlock * 0.05;
}

export const mockPlan: PlanSession[] = (() => {
  const out: PlanSession[] = [];
  for (let w = 1; w <= PROGRAM_WEEKS; w++) {
    const f = loadFactor(w);
    for (const t of weekTemplate) {
      // Taper weeks drop the strength work and race week drops Saturday too.
      if (w >= PROGRAM_WEEKS - 1 && t.sport === "strength") continue;
      if (w === PROGRAM_WEEKS && t.dow >= 5) continue;
      const date = addDays(PROGRAM_START, (w - 1) * 7 + t.dow);
      out.push({
        id: `p-${date}-${t.sport}-${t.dow}`,
        date,
        sport: t.sport,
        title: t.title,
        detail: t.detail,
        targetMin: Math.round((t.min * f) / 5) * 5,
        targetKm: t.km === null ? null : Math.round(t.km * f * 10) / 10,
        athletes: [],
        phase: phaseForWeek(w),
        week: w,
      });
    }
  }
  return out;
})();

/* ------------------------------------------------------------------ */
/* Activities                                                          */
/* ------------------------------------------------------------------ */

const sportMeta: Record<
  Sport,
  { stravaType: string; names: string[]; hr: [number, number]; speedKmh: number }
> = {
  swim: { stravaType: "Swim", names: ["{tod} swim", "Pool session", "Lane work"], hr: [128, 142], speedKmh: 2.7 },
  bike: { stravaType: "Ride", names: ["{tod} ride", "Trainer session", "Out and back"], hr: [136, 156], speedKmh: 29 },
  run: { stravaType: "Run", names: ["{tod} run", "River loop", "Track"], hr: [142, 164], speedKmh: 11.2 },
  strength: { stravaType: "WeightTraining", names: ["Strength", "Gym"], hr: [104, 122], speedKmh: 0 },
  other: { stravaType: "Workout", names: ["Mobility"], hr: [90, 105], speedKmh: 0 },
};

/** Strava's default naming by start hour. */
function timeOfDay(hour: number): string {
  if (hour < 12) return "Morning";
  if (hour < 17) return "Lunch";
  return "Evening";
}

const photoSeeds: Record<Sport, string[]> = {
  swim: ["lane", "pool", "goggles"],
  bike: ["road", "ridge", "sunrise", "coast"],
  run: ["trail", "bridge", "track", "river"],
  strength: ["rack"],
  other: ["mat"],
};

function makePhotos(rand: () => number, sport: Sport, id: string): ActivityPhoto[] {
  const roll = rand();
  const count = roll < 0.62 ? 0 : roll < 0.88 ? 1 : roll < 0.97 ? 2 : 3;
  const seeds = photoSeeds[sport];
  return Array.from({ length: count }, (_, i) => {
    const seed = `${seeds[(i + Math.floor(rand() * 10)) % seeds.length]}-${id}-${i}`;
    const landscape = rand() < 0.7;
    const w = landscape ? 600 : 450;
    const h = landscape ? 400 : 600;
    return {
      id: `${id}-ph${i}`,
      url: `https://picsum.photos/seed/${seed}/${w}/${h}`,
      width: w,
      height: h,
      caption: null,
    };
  });
}

type Profile = { seed: number; adherence: number; hrOffset: number; startHour: number };

const profiles: Record<AthleteSlug, Profile> = {
  filippo: { seed: 11, adherence: 0.9, hrOffset: 0, startHour: 6 },
  amir: { seed: 23, adherence: 0.82, hrOffset: 6, startHour: 18 },
};

function generateActivities(athlete: AthleteSlug, today: string): Activity[] {
  const p = profiles[athlete];
  const rand = mulberry32(p.seed);
  const out: Activity[] = [];
  let n = 0;

  for (const session of mockPlan) {
    if (session.date >= today) continue;
    if (session.athletes.length && !session.athletes.includes(athlete)) continue;

    const roll = rand();
    if (roll > p.adherence) continue; // missed
    const partial = roll > p.adherence - 0.12;
    const ratio = partial ? 0.45 + rand() * 0.25 : 0.92 + rand() * 0.2;

    const meta = sportMeta[session.sport];
    const minutes = Math.max(10, Math.round((session.targetMin ?? 30) * ratio));
    const movingTimeSec = minutes * 60;
    const distanceM =
      meta.speedKmh === 0 ? 0 : Math.round((meta.speedKmh * (0.94 + rand() * 0.12) * minutes) / 60 * 1000);
    const hrSpan = meta.hr[1] - meta.hr[0];
    const avgHr = Math.round(meta.hr[0] + rand() * hrSpan + p.hrOffset);
    const id = `${athlete === "filippo" ? "1" : "2"}${String(++n).padStart(4, "0")}`;
    const hour = p.startHour + Math.floor(rand() * 3);
    const minute = Math.floor(rand() * 60);

    out.push({
      id,
      athlete,
      sport: session.sport,
      stravaSportType: meta.stravaType,
      name: meta.names[Math.floor(rand() * meta.names.length)].replace("{tod}", timeOfDay(hour)),
      description: rand() < 0.2 ? "Felt good. Kept it honest." : null,
      startLocal: `${session.date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-05:00`,
      date: session.date,
      movingTimeSec,
      elapsedTimeSec: movingTimeSec + Math.round(rand() * 240),
      distanceM,
      elevationGainM: session.sport === "bike" ? Math.round(distanceM * 0.008) : session.sport === "run" ? Math.round(distanceM * 0.005) : 0,
      avgHr: session.sport === "strength" && rand() < 0.4 ? null : avgHr,
      maxHr: avgHr + 14 + Math.round(rand() * 12),
      avgWatts: session.sport === "bike" ? 180 + Math.round(rand() * 50) : null,
      effort: Math.round(minutes * (0.6 + rand() * 0.6)),
      photos: makePhotos(rand, session.sport, id),
      detailed: true,
    });
  }

  // A couple of unplanned sessions so the matcher has something to chew on.
  const extras = [addDays(PROGRAM_START, 0), addDays(PROGRAM_START, 21)];
  for (const date of extras) {
    if (date >= today) continue;
    const id = `${athlete === "filippo" ? "1" : "2"}${String(++n).padStart(4, "0")}`;
    const minutes = 25 + Math.floor(rand() * 15);
    out.push({
      id,
      athlete,
      sport: "run",
      stravaSportType: "Run",
      name: "Shakeout",
      description: null,
      startLocal: `${date}T07:10:00-05:00`,
      date,
      movingTimeSec: minutes * 60,
      elapsedTimeSec: minutes * 60 + 60,
      distanceM: Math.round((9.5 * minutes) / 60 * 1000),
      elevationGainM: 20,
      avgHr: 136 + p.hrOffset,
      maxHr: 152 + p.hrOffset,
      avgWatts: null,
      effort: 18,
      photos: [],
      detailed: true,
    });
  }

  return out.sort((a, b) => a.startLocal.localeCompare(b.startLocal));
}

export const mockActivities: Activity[] = [
  ...generateActivities("filippo", MOCK_TODAY),
  ...generateActivities("amir", MOCK_TODAY),
];

/* ------------------------------------------------------------------ */
/* Inline math. Mirrors matcher.ts / aggregate.ts.                     */
/* ------------------------------------------------------------------ */

const SPORTS: Sport[] = ["swim", "bike", "run", "strength", "other"];

function emptyBySport(): Record<Sport, { timeSec: number; distanceM: number; count: number }> {
  return Object.fromEntries(SPORTS.map((s) => [s, { timeSec: 0, distanceM: 0, count: 0 }])) as Record<
    Sport,
    { timeSec: number; distanceM: number; count: number }
  >;
}

function statusFor(planned: PlanSession[], actual: Activity[], date: string, today: string): MatchStatus {
  if (date >= today && actual.length === 0) return planned.length ? "upcoming" : "rest";
  if (planned.length === 0) return actual.length ? "done" : "rest";
  if (actual.length === 0) return "missed";
  const target = planned.reduce((s, p) => s + (p.targetMin ?? 0) * 60, 0);
  const done = actual.reduce((s, a) => s + a.movingTimeSec, 0);
  if (target === 0) return "done";
  return done / target >= 0.8 ? "done" : "partial";
}

/**
 * Pair every day from program start through `until` with its plan and
 * activities for one athlete. Returns oldest first.
 */
export function matchDays(
  plan: PlanSession[],
  activities: Activity[],
  athlete: AthleteSlug,
  today: string,
  until: string = today,
): DayMatch[] {
  const byDate = new Map<string, DayMatch>();
  const total = daysBetween(PROGRAM_START, until);
  for (let i = 0; i <= total; i++) {
    const date = addDays(PROGRAM_START, i);
    byDate.set(date, { date, athlete, planned: [], actual: [], status: "rest" });
  }
  for (const p of plan) {
    if (p.athletes.length && !p.athletes.includes(athlete)) continue;
    byDate.get(p.date)?.planned.push(p);
  }
  for (const a of activities) {
    if (a.athlete !== athlete) continue;
    byDate.get(a.date)?.actual.push(a);
  }
  for (const m of byDate.values()) {
    m.status = statusFor(m.planned, m.actual, m.date, today);
  }
  return [...byDate.values()];
}

/** Roll day matches up into ISO weeks (Monday start). Oldest first. */
export function weeklyTotals(matches: DayMatch[]): WeeklyTotals[] {
  const weeks = new Map<string, WeeklyTotals>();
  for (const m of matches) {
    const weekStart = weekStartOf(m.date);
    let w = weeks.get(weekStart);
    if (!w) {
      w = { weekStart, athlete: m.athlete, bySport: emptyBySport(), totalTimeSec: 0, plannedTimeSec: 0 };
      weeks.set(weekStart, w);
    }
    for (const p of m.planned) w.plannedTimeSec += (p.targetMin ?? 0) * 60;
    for (const a of m.actual) {
      w.bySport[a.sport].timeSec += a.movingTimeSec;
      w.bySport[a.sport].distanceM += a.distanceM;
      w.bySport[a.sport].count += 1;
      w.totalTimeSec += a.movingTimeSec;
    }
  }
  return [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/** Headline totals for one athlete since program start. */
export function summarize(activities: Activity[], athlete: AthleteSlug, today: string): TrainingSummary {
  const mine = activities.filter((a) => a.athlete === athlete && a.date >= PROGRAM_START);
  const bySport = emptyBySport();
  let totalTimeSec = 0;
  let totalDistanceM = 0;
  const days = new Set<string>();
  for (const a of mine) {
    bySport[a.sport].timeSec += a.movingTimeSec;
    bySport[a.sport].distanceM += a.distanceM;
    bySport[a.sport].count += 1;
    totalTimeSec += a.movingTimeSec;
    totalDistanceM += a.distanceM;
    days.add(a.date);
  }
  // Streak counts back from today; today itself may still be empty.
  let streakDays = 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  while (days.has(cursor)) {
    streakDays++;
    cursor = addDays(cursor, -1);
  }
  return {
    athlete,
    since: PROGRAM_START,
    totalTimeSec,
    totalDistanceM,
    sessions: mine.length,
    streakDays,
    bySport,
  };
}
