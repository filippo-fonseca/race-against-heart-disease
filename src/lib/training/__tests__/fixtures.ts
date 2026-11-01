import type { Activity, PlanSession } from "../types";

let seq = 1;

export function activity(over: Partial<Activity> & Pick<Activity, "date" | "sport">): Activity {
  const id = String(seq++);
  const min = over.movingTimeSec ?? 3600;
  return {
    id,
    athlete: "filippo",
    stravaSportType: over.sport === "bike" ? "VirtualRide" : over.sport === "run" ? "Run" : over.sport === "swim" ? "Swim" : "WeightTraining",
    name: `${over.sport} ${id}`,
    description: null,
    startLocal: `${over.date}T07:00:00-05:00`,
    movingTimeSec: min,
    elapsedTimeSec: min,
    distanceM: 0,
    elevationGainM: 0,
    avgHr: null,
    maxHr: null,
    avgWatts: null,
    effort: null,
    photos: [],
    detailed: false,
    ...over,
  };
}

export function planned(over: Partial<PlanSession> & Pick<PlanSession, "date" | "sport">): PlanSession {
  return {
    id: `${over.date}-${over.sport}-${seq++}`,
    title: `${over.sport} session`,
    detail: null,
    targetMin: 60,
    targetKm: null,
    athletes: [],
    phase: "Base 1",
    week: 1,
    ...over,
  };
}
