import type { Sport } from "@/lib/training/types";

/** "8h 40m", "40m", or "0m". */
export function fmtHM(sec: number): string {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

/** Hours with one decimal, no unit: "12.4". */
export function fmtHours(sec: number): string {
  return (sec / 3600).toFixed(1);
}

/** Kilometres with one decimal (two for swims under 10 km). */
export function fmtKm(m: number, sport?: Sport): string {
  const km = m / 1000;
  if (sport === "swim" && km < 10) return km.toFixed(2);
  if (km >= 100) return km.toFixed(0);
  return km.toFixed(1);
}

export function fmtMinutes(sec: number): string {
  return `${Math.round(sec / 60)} min`;
}

const longDate = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const monthOnly = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

/** "Thu, Dec 10" */
export function fmtDay(iso: string): string {
  return longDate.format(new Date(`${iso}T00:00:00Z`));
}

/** "Dec 10" */
export function fmtShort(iso: string): string {
  return shortDate.format(new Date(`${iso}T00:00:00Z`));
}

/** "Dec" */
export function fmtMonth(iso: string): string {
  return monthOnly.format(new Date(`${iso}T00:00:00Z`));
}

/** "Dec 7 to 13" or "Nov 30 to Dec 6" */
export function fmtWeekRange(weekStart: string): string {
  const end = new Date(`${weekStart}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const endIso = end.toISOString().slice(0, 10);
  const sameMonth = weekStart.slice(5, 7) === endIso.slice(5, 7);
  return sameMonth
    ? `${fmtShort(weekStart)} to ${end.getUTCDate()}`
    : `${fmtShort(weekStart)} to ${fmtShort(endIso)}`;
}

/** Local clock time from an ISO string with offset, "06:42". */
export function fmtClock(startLocal: string): string {
  return startLocal.slice(11, 16);
}

export const sportLabel: Record<Sport, string> = {
  swim: "Swim",
  bike: "Bike",
  run: "Run",
  strength: "Strength",
  other: "Other",
};

/** Past-tense verb for the auto note. */
export const sportVerb: Record<Sport, string> = {
  swim: "Swam",
  bike: "Rode",
  run: "Ran",
  strength: "Lifted",
  other: "Moved",
};

/** The three race legs in metres, for cumulative "times the race distance". */
export const raceLegM: Partial<Record<Sport, number>> = {
  swim: 1_900,
  bike: 90_000,
  run: 21_100,
};
