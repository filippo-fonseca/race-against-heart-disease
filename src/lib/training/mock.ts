/**
 * Deterministic fixtures for the training log, reachable only through
 * `/training?mock=1` outside production. Activities are generated against the
 * real program (data/plan.json), so the matcher and charts see realistic
 * adherence, partials, misses, and a few unplanned sessions.
 */

import type { Activity, ActivityPhoto, Athlete, AthleteSlug, PlanSession, Sport } from "./types";
import { addDays } from "./dates";
import { PLAN_START, getPlan } from "./plan";

/** The fixtures pretend it is this day: a Thursday in week 6. */
export const MOCK_TODAY = "2026-12-10";

export const mockAthletes: Athlete[] = [
  { slug: "filippo", name: "Filippo", stravaId: 1001, avatarUrl: null },
  { slug: "amir", name: "Amir", stravaId: 1002, avatarUrl: null },
];

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

const sportMeta: Record<Sport, { stravaType: string; names: string[]; hr: [number, number]; speedKmh: number }> = {
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
    return { id: `${id}-ph${i}`, url: `https://picsum.photos/seed/${seed}/${w}/${h}`, width: w, height: h, caption: null };
  });
}

type Profile = { seed: number; adherence: number; hrOffset: number; startHour: number };

const profiles: Record<AthleteSlug, Profile> = {
  filippo: { seed: 11, adherence: 0.9, hrOffset: 0, startHour: 6 },
  amir: { seed: 23, adherence: 0.82, hrOffset: 6, startHour: 18 },
};

function generateActivities(athlete: AthleteSlug, plan: PlanSession[], today: string): Activity[] {
  const p = profiles[athlete];
  const rand = mulberry32(p.seed);
  const out: Activity[] = [];
  let n = 0;
  const nextId = () => `${athlete === "filippo" ? "1" : "2"}${String(++n).padStart(4, "0")}`;

  for (const session of plan) {
    if (session.date >= today) continue;
    if (session.athletes.length && !session.athletes.includes(athlete)) continue;

    const roll = rand();
    if (roll > p.adherence) continue; // missed
    const partial = roll > p.adherence - 0.12;
    const ratio = partial ? 0.45 + rand() * 0.25 : 0.92 + rand() * 0.2;

    const meta = sportMeta[session.sport];
    const minutes = Math.max(10, Math.round((session.targetMin ?? 30) * ratio));
    const movingTimeSec = minutes * 60;
    const distanceM = meta.speedKmh === 0 ? 0 : Math.round(((meta.speedKmh * (0.94 + rand() * 0.12) * minutes) / 60) * 1000);
    const hrSpan = meta.hr[1] - meta.hr[0];
    const avgHr = Math.round(meta.hr[0] + rand() * hrSpan + p.hrOffset);
    const id = nextId();
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
  for (const date of [PLAN_START, addDays(PLAN_START, 21)]) {
    if (date >= today) continue;
    const minutes = 25 + Math.floor(rand() * 15);
    out.push({
      id: nextId(),
      athlete,
      sport: "run",
      stravaSportType: "Run",
      name: "Shakeout",
      description: null,
      startLocal: `${date}T07:10:00-05:00`,
      date,
      movingTimeSec: minutes * 60,
      elapsedTimeSec: minutes * 60 + 60,
      distanceM: Math.round(((9.5 * minutes) / 60) * 1000),
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

/** Both athletes' fixtures through `today`, built against the real plan. */
export function mockActivities(plan: PlanSession[] = getPlan(), today: string = MOCK_TODAY): Activity[] {
  return [...generateActivities("filippo", plan, today), ...generateActivities("amir", plan, today)];
}
