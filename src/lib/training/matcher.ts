/**
 * Pairs planned sessions with Strava activities, one athlete-day at a time.
 *
 * Status rules:
 *   no plan, no activity                       -> "rest"
 *   plan, nothing logged, date is today/future -> "upcoming"
 *   plan, nothing logged, date is past         -> "missed"
 *   every planned sport reached 75% of its     -> "done"
 *     time or distance target
 *   anything logged that falls short, or of    -> "partial"
 *     a sport that was not planned
 *   no plan but something logged               -> "done" (an unplanned session still counts)
 *
 * When several sessions of one sport are planned on a day (or an activity is
 * split into several uploads) the comparison is made per sport, on totals.
 */

import type { Activity, AthleteSlug, DayMatch, MatchStatus, PlanSession, Sport } from "./types";
import { appliesTo } from "./plan";
import { eachDay, type ISODate, todayISO } from "./dates";

/** Fraction of the target that counts as completing the session. */
export const DONE_THRESHOLD = 0.75;

/** True when the logged totals for one sport satisfy the planned totals. */
export function meetsTarget(planned: PlanSession[], actual: Activity[]): boolean {
  const targetSec = planned.reduce((n, s) => n + (s.targetMin ?? 0) * 60, 0);
  const targetM = planned.reduce((n, s) => n + (s.targetKm ?? 0) * 1000, 0);
  const movingSec = actual.reduce((n, a) => n + a.movingTimeSec, 0);
  const distanceM = actual.reduce((n, a) => n + a.distanceM, 0);
  if (targetSec === 0 && targetM === 0) return actual.length > 0;
  if (targetSec > 0 && movingSec >= targetSec * DONE_THRESHOLD) return true;
  if (targetM > 0 && distanceM >= targetM * DONE_THRESHOLD) return true;
  return false;
}

/**
 * Status for one athlete-day. `today` is injectable for tests and for
 * rendering in a fixed timezone; it defaults to the race-local date.
 */
export function matchDay(
  date: ISODate,
  athlete: AthleteSlug,
  planned: PlanSession[],
  actual: Activity[],
  today: ISODate = todayISO()
): DayMatch {
  const plan = planned.filter((s) => s.date === date && appliesTo(s, athlete));
  const acts = actual.filter((a) => a.date === date && a.athlete === athlete);
  return { date, athlete, planned: plan, actual: acts, status: statusFor(date, plan, acts, today) };
}

export function statusFor(date: ISODate, planned: PlanSession[], actual: Activity[], today: ISODate): MatchStatus {
  if (planned.length === 0) return actual.length === 0 ? "rest" : "done";
  if (actual.length === 0) return date >= today ? "upcoming" : "missed";

  const plannedBySport = new Map<Sport, PlanSession[]>();
  for (const s of planned) plannedBySport.set(s.sport, [...(plannedBySport.get(s.sport) ?? []), s]);

  let allDone = true;
  for (const [sport, sessions] of plannedBySport) {
    const acts = actual.filter((a) => a.sport === sport);
    if (acts.length === 0 || !meetsTarget(sessions, acts)) allDone = false;
  }
  return allDone ? "done" : "partial";
}

/** One DayMatch per calendar day in the inclusive range. */
export function buildMatches(
  range: { from: ISODate; to: ISODate },
  athlete: AthleteSlug,
  plan: PlanSession[],
  activities: Activity[],
  today: ISODate = todayISO()
): DayMatch[] {
  const planByDate = new Map<ISODate, PlanSession[]>();
  for (const s of plan) {
    if (!appliesTo(s, athlete)) continue;
    planByDate.set(s.date, [...(planByDate.get(s.date) ?? []), s]);
  }
  const actsByDate = new Map<ISODate, Activity[]>();
  for (const a of activities) {
    if (a.athlete !== athlete) continue;
    actsByDate.set(a.date, [...(actsByDate.get(a.date) ?? []), a]);
  }
  return eachDay(range.from, range.to).map((date) => {
    const planned = planByDate.get(date) ?? [];
    const actual = actsByDate.get(date) ?? [];
    return { date, athlete, planned, actual, status: statusFor(date, planned, actual, today) };
  });
}

/* ------------------------------------------------------------------ */
/* Prose                                                               */
/* ------------------------------------------------------------------ */

const VERB: Record<Sport, string> = {
  swim: "Swam",
  bike: "Rode",
  run: "Ran",
  strength: "Lifted",
  other: "Logged",
};

const NOUN: Record<Sport, string> = {
  swim: "swim",
  bike: "ride",
  run: "run",
  strength: "strength",
  other: "session",
};

export function fmtMinutes(sec: number): string {
  return `${Math.round(sec / 60)} min`;
}

export function fmtDistance(sport: Sport, meters: number): string | null {
  if (meters <= 0) return null;
  if (sport === "swim") return `${Math.round(meters)} m`;
  if (sport === "bike" || sport === "run") return `${(meters / 1000).toFixed(1)} km`;
  return null;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "60 min Z2 ride" style fragment for a planned session. */
export function describePlanned(s: PlanSession): string {
  const title = s.title.replace(/^(swim|bike|run|strength):\s*/i, "").trim();
  const noun = title.length > 0 ? title : NOUN[s.sport];
  if (s.targetMin != null) return `${s.targetMin} min ${noun.toLowerCase()}`;
  if (s.targetKm != null) return `${s.sport === "swim" ? `${Math.round(s.targetKm * 1000)} m` : `${s.targetKm} km`} ${noun.toLowerCase()}`;
  return noun.toLowerCase();
}

/** "Rode 62 min, avg 145 bpm." style sentence for one activity. */
export function describeActual(a: Activity): string {
  const parts: string[] = [];
  const dist = fmtDistance(a.sport, a.distanceM);
  if (dist) parts.push(`${dist} in ${fmtMinutes(a.movingTimeSec)}`);
  else parts.push(fmtMinutes(a.movingTimeSec));
  if (a.avgHr != null) parts.push(`avg ${Math.round(a.avgHr)} bpm`);
  if (a.sport === "bike" && a.avgWatts != null) parts.push(`${Math.round(a.avgWatts)} W`);
  return `${VERB[a.sport]} ${parts.join(", ")}.`;
}

/** One-line note for the log, e.g. "Planned 60 min Z2 ride. Rode 62 min, avg 145 bpm." */
export function summarize(match: DayMatch): string {
  const { planned, actual, status } = match;
  const plannedText = planned.length > 0 ? `Planned ${joinList(planned.map(describePlanned))}.` : "";
  const actualText = actual.map(describeActual).join(" ");

  switch (status) {
    case "rest":
      return "Rest day.";
    case "upcoming":
      return plannedText;
    case "missed":
      return `${plannedText} Nothing logged.`;
    case "done":
      return planned.length === 0 ? `Unplanned. ${actualText}` : `${plannedText} ${actualText}`;
    case "partial": {
      const plannedSports = new Set(planned.map((s) => s.sport));
      const skipped = planned.filter((s) => !actual.some((a) => a.sport === s.sport));
      const extra = actual.filter((a) => !plannedSports.has(a.sport));
      const notes: string[] = [];
      if (skipped.length > 0) notes.push(`No ${joinList(skipped.map((s) => NOUN[s.sport]))} logged.`);
      if (extra.length > 0 && skipped.length === 0) notes.push("Different session than planned.");
      if (notes.length === 0) notes.push("Short of the target.");
      return [plannedText, actualText, ...notes].filter(Boolean).join(" ");
    }
  }
}
