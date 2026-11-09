/**
 * Deterministic fixtures for the training feed, reachable only through
 * `/training?mock=1` outside production. A fixed weekly rhythm from day one
 * up to MOCK_TODAY, with seeded noise, indoor rides (no distance), HIIT, and
 * a spread of photo counts so the gallery layouts all get exercised.
 */

import type { Activity, ActivityPhoto, Athlete, SportBucket } from "./types";
import { TRAINING_START, addDays, eachDay, weekdayIndex } from "./dates";

/** The fixtures pretend it is this day: a Thursday in week 6. */
export const MOCK_TODAY = "2026-12-10";

export const mockAthletes: Athlete[] = [{ slug: "filippo", name: "Filippo", stravaId: 1001, avatarUrl: null }];

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

const meta: Record<SportBucket, { stravaType: string; name: string; hr: [number, number]; speedKmh: number }> = {
  swim: { stravaType: "Swim", name: "{tod} swim", hr: [128, 142], speedKmh: 2.7 },
  bike: { stravaType: "VirtualRide", name: "Trainer ride", hr: [132, 150], speedKmh: 0 },
  run: { stravaType: "Run", name: "{tod} run", hr: [142, 164], speedKmh: 11.8 },
  strength: { stravaType: "HighIntensityIntervalTraining", name: "{tod} HIIT", hr: [118, 140], speedKmh: 0 },
};

/** Weekly rhythm, Monday first: [sport, minutes] per session. */
const week: [SportBucket, number][][] = [
  [["strength", 40]],
  [["swim", 30], ["bike", 45]],
  [["run", 35], ["strength", 30]],
  [["swim", 35]],
  [["bike", 40], ["strength", 45]],
  [["bike", 90]],
  [["run", 50], ["swim", 30]],
];

function timeOfDay(hour: number): string {
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

function makePhotos(count: number, id: string, rand: () => number): ActivityPhoto[] {
  return Array.from({ length: count }, (_, i) => {
    const landscape = rand() < 0.7;
    const w = landscape ? 1200 : 900;
    const h = landscape ? 800 : 1200;
    return { id: `${id}-ph${i}`, url: `https://picsum.photos/seed/rahd-${id}-${i}/${w}/${h}`, width: w, height: h, caption: null };
  });
}

/** Filippo's fixtures through the day before `today`. */
export function mockActivities(today: string = MOCK_TODAY): Activity[] {
  const rand = mulberry32(11);
  const out: Activity[] = [];
  let n = 0;
  for (const date of eachDay(TRAINING_START, addDays(today, -1))) {
    const sessions = week[weekdayIndex(date)];
    sessions.forEach(([sport, baseMin], k) => {
      if (rand() < 0.08) return; // the odd skipped session
      const m = meta[sport];
      const minutes = Math.max(10, Math.round(baseMin * (0.85 + rand() * 0.3)));
      const movingTimeSec = minutes * 60;
      const distanceM = m.speedKmh === 0 ? 0 : Math.round(((m.speedKmh * (0.94 + rand() * 0.12) * minutes) / 60) * 1000);
      const avgHr = Math.round(m.hr[0] + rand() * (m.hr[1] - m.hr[0]));
      const hour = k === 0 ? 7 + Math.floor(rand() * 2) : 17 + Math.floor(rand() * 2);
      const minute = Math.floor(rand() * 60);
      const id = `9${String(++n).padStart(4, "0")}`;
      const roll = rand();
      const photoCount = roll < 0.7 ? 0 : roll < 0.82 ? 1 : roll < 0.9 ? 2 : roll < 0.95 ? 4 : 8;
      out.push({
        id,
        athlete: "filippo",
        sport,
        stravaSportType: m.stravaType,
        name: m.name.replace("{tod}", timeOfDay(hour)),
        description: rand() < 0.25 ? "Felt good. Kept it honest and easy, then a short build to finish." : null,
        startLocal: `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-06:00`,
        date,
        movingTimeSec,
        elapsedTimeSec: movingTimeSec + Math.round(rand() * 240),
        distanceM,
        elevationGainM: sport === "run" ? Math.round(distanceM * 0.005) : 0,
        avgHr,
        maxHr: avgHr + 14 + Math.round(rand() * 12),
        avgWatts: sport === "bike" ? 170 + Math.round(rand() * 50) : null,
        effort: Math.round(minutes * (0.6 + rand() * 0.6)),
        photos: makePhotos(photoCount, id, rand),
        detailed: true,
      });
    });
  }
  return out.sort((a, b) => a.startLocal.localeCompare(b.startLocal));
}
