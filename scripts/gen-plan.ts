/**
 * Generates data/plan.json: the 22-week IRONMAN 70.3 Texas program.
 *
 * This file is the editable source. Change the week table or the session
 * builders here, then run `npm run plan:gen` to regenerate the JSON.
 *
 * Athlete profile the plan is written for: strong runner (1:23 half) coming
 * back from a knee issue on low run volume, new to swimming (first swim
 * Oct 30, 2026), regular indoor cyclist. Goal: sub-5:00 at 70.3 Texas on
 * April 4, 2027, which is roughly a 35 min swim (1:50/100 m), a 2:30 bike
 * (~36 kph) and a 1:40 run (4:45/km) plus transitions.
 *
 * Weekly skeleton (Monday is always a full rest day and is omitted from the
 * JSON; the matcher infers "rest" when no session exists):
 *
 *   Tue  swim (technique)        + bike (intervals)
 *   Wed  run (quality)           + strength (knee rehab A)
 *   Thu  swim (main set)         + run (easy)            [Base only]
 *   Fri  bike (easy spin)        + strength (hip/glute B)
 *   Sat  long ride               + brick run             [Build 1 onward]
 *   Sun  long run                + swim (continuous)
 *
 * Every 4th week (4, 8, 12, 16) is a recovery week at roughly 65-70% of the
 * preceding week's volume, and weeks 4, 8 and 16 carry the benchmark tests.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PlanSession, Sport } from "../src/lib/training/types";
import { addDays, type ISODate, type Weekday } from "../src/lib/training/dates";

const PLAN_START: ISODate = "2026-11-02"; // Monday
const RACE_DATE: ISODate = "2027-04-04"; // Sunday of week 22
const WEEKS = 22;

type Phase = "Base 1" | "Base 2" | "Build 1" | "Build 2" | "Peak" | "Taper";

function phaseOf(week: number): Phase {
  if (week <= 4) return "Base 1";
  if (week <= 8) return "Base 2";
  if (week <= 12) return "Build 1";
  if (week <= 16) return "Build 2";
  if (week <= 19) return "Peak";
  return "Taper";
}

/**
 * Per-week volume knobs, all in minutes except swims (km for Tue / Thu / Sun).
 * `brick` is the Saturday run off the bike; when it is 0 the third run is the
 * Thursday easy run instead. `strength` is the number of sessions (2, 1 or 0).
 */
interface WeekSpec {
  week: number;
  recovery?: boolean;
  longRide: number;
  brick: number;
  longRun: number;
  bikeInt: number;
  bikeEasy: number;
  runQ: number;
  runE: number;
  swim: [number, number, number];
  strength: 0 | 1 | 2;
}

const WEEK_TABLE: WeekSpec[] = [
  // Base 1: rebuild run frequency gently, learn to swim, keep the bike honest.
  { week: 1, longRide: 75, brick: 0, longRun: 45, bikeInt: 60, bikeEasy: 45, runQ: 25, runE: 25, swim: [1.2, 1.4, 1.0], strength: 2 },
  { week: 2, longRide: 85, brick: 0, longRun: 50, bikeInt: 60, bikeEasy: 45, runQ: 30, runE: 30, swim: [1.3, 1.5, 1.1], strength: 2 },
  { week: 3, longRide: 95, brick: 0, longRun: 55, bikeInt: 60, bikeEasy: 50, runQ: 30, runE: 30, swim: [1.4, 1.6, 1.2], strength: 2 },
  { week: 4, recovery: true, longRide: 55, brick: 0, longRun: 40, bikeInt: 60, bikeEasy: 30, runQ: 35, runE: 20, swim: [1.0, 1.2, 0.8], strength: 1 },
  // Base 2: aerobic volume climbs, swims get longer, first tempo work on the run.
  { week: 5, longRide: 105, brick: 0, longRun: 60, bikeInt: 65, bikeEasy: 50, runQ: 35, runE: 30, swim: [1.5, 1.8, 1.3], strength: 2 },
  { week: 6, longRide: 115, brick: 0, longRun: 65, bikeInt: 65, bikeEasy: 50, runQ: 35, runE: 35, swim: [1.6, 1.9, 1.4], strength: 2 },
  { week: 7, longRide: 125, brick: 0, longRun: 70, bikeInt: 70, bikeEasy: 55, runQ: 40, runE: 35, swim: [1.7, 2.0, 1.5], strength: 2 },
  { week: 8, recovery: true, longRide: 75, brick: 0, longRun: 50, bikeInt: 60, bikeEasy: 35, runQ: 35, runE: 20, swim: [1.2, 1.4, 1.0], strength: 1 },
  // Build 1: race-specific intensity arrives, brick runs start.
  { week: 9, longRide: 135, brick: 15, longRun: 75, bikeInt: 70, bikeEasy: 55, runQ: 40, runE: 0, swim: [1.8, 2.1, 1.6], strength: 2 },
  { week: 10, longRide: 145, brick: 20, longRun: 80, bikeInt: 70, bikeEasy: 60, runQ: 40, runE: 0, swim: [1.9, 2.2, 1.7], strength: 2 },
  { week: 11, longRide: 150, brick: 25, longRun: 85, bikeInt: 75, bikeEasy: 60, runQ: 45, runE: 0, swim: [2.0, 2.3, 1.8], strength: 2 },
  { week: 12, recovery: true, longRide: 95, brick: 15, longRun: 60, bikeInt: 50, bikeEasy: 40, runQ: 30, runE: 0, swim: [1.5, 1.7, 1.3], strength: 1 },
  // Build 2: longest steady work, race pace rehearsed every week.
  { week: 13, longRide: 160, brick: 25, longRun: 90, bikeInt: 75, bikeEasy: 60, runQ: 45, runE: 0, swim: [2.0, 2.4, 1.9], strength: 2 },
  { week: 14, longRide: 170, brick: 30, longRun: 95, bikeInt: 75, bikeEasy: 60, runQ: 45, runE: 0, swim: [2.1, 2.4, 2.0], strength: 2 },
  { week: 15, longRide: 180, brick: 30, longRun: 100, bikeInt: 75, bikeEasy: 60, runQ: 50, runE: 0, swim: [2.2, 2.5, 2.0], strength: 2 },
  { week: 16, recovery: true, longRide: 110, brick: 20, longRun: 70, bikeInt: 60, bikeEasy: 40, runQ: 35, runE: 0, swim: [1.6, 1.8, 1.4], strength: 1 },
  // Peak: biggest weeks, race simulation in week 18.
  { week: 17, longRide: 180, brick: 35, longRun: 105, bikeInt: 75, bikeEasy: 60, runQ: 50, runE: 0, swim: [2.2, 2.5, 2.0], strength: 2 },
  { week: 18, longRide: 150, brick: 40, longRun: 50, bikeInt: 75, bikeEasy: 60, runQ: 45, runE: 0, swim: [2.2, 2.5, 0], strength: 1 }, // Sat is the race simulation; no Sunday swim
  { week: 19, longRide: 150, brick: 30, longRun: 90, bikeInt: 75, bikeEasy: 60, runQ: 45, runE: 0, swim: [2.0, 2.4, 1.9], strength: 1 },
  // Taper: keep intensity, cut volume, arrive fresh.
  { week: 20, longRide: 120, brick: 20, longRun: 70, bikeInt: 60, bikeEasy: 45, runQ: 40, runE: 0, swim: [1.8, 2.0, 1.6], strength: 1 },
  { week: 21, longRide: 90, brick: 15, longRun: 55, bikeInt: 50, bikeEasy: 40, runQ: 35, runE: 0, swim: [1.5, 1.6, 1.2], strength: 1 },
  { week: 22, longRide: 0, brick: 0, longRun: 0, bikeInt: 45, bikeEasy: 30, runQ: 30, runE: 0, swim: [1.2, 1.0, 0], strength: 0 },
];

// Pace assumptions used to derive secondary distance targets.
const BIKE_KPH = 32; // steady indoor pace; race-pace intervals sit nearer 36 kph
const RUN_MIN_PER_KM = 5.1; // easy to steady running, race pace is 4:45/km
function swimMinPerKm(week: number): number {
  // New swimmer: roughly 2:24/100 m with rest in week 1, trending toward 2:00.
  return 24 - (week - 1) * 0.18;
}

const round = (n: number, step = 1) => Math.round(n / step) * step;
const round1 = (n: number) => Math.round(n * 10) / 10;

const WEEKDAY_OFFSET: Record<Weekday, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function dateOf(week: number, day: Weekday): ISODate {
  return addDays(PLAN_START, (week - 1) * 7 + WEEKDAY_OFFSET[day]);
}

interface Draft {
  day: Weekday;
  sport: Sport;
  title: string;
  detail: string | null;
  targetMin: number | null;
  targetKm?: number | null;
  /** Suffix when a day already has a session of the same sport. */
  slot?: string;
}

function session(week: number, d: Draft): PlanSession {
  const id = [`w${String(week).padStart(2, "0")}`, d.day, d.sport, d.slot].filter(Boolean).join("-");
  return {
    id,
    date: dateOf(week, d.day),
    sport: d.sport,
    title: d.title,
    detail: d.detail,
    targetMin: d.targetMin,
    targetKm: d.targetKm ?? null,
    athletes: [],
    phase: phaseOf(week),
    week,
  };
}

function swim(week: number, day: Weekday, km: number, title: string, detail: string): Draft {
  return {
    day,
    sport: "swim",
    title,
    detail,
    targetMin: round(km * swimMinPerKm(week) + 8, 5),
    targetKm: round1(km),
  };
}

function bike(day: Weekday, min: number, title: string, detail: string, kph = BIKE_KPH): Draft {
  return { day, sport: "bike", title, detail, targetMin: min, targetKm: round((min / 60) * kph) };
}

function run(day: Weekday, min: number, title: string, detail: string): Draft {
  return { day, sport: "run", title, detail, targetMin: min, targetKm: round(min / RUN_MIN_PER_KM, 0.5) };
}

function strength(day: Weekday, min: number, variant: "A" | "B" | "mobility"): Draft {
  const detail =
    variant === "A"
      ? "Knee rehab A: Spanish squats 3 x 45 s, Bulgarian split squats 3 x 8 per side, single-leg RDL 3 x 8, step-downs 3 x 10, side plank 3 x 30 s."
      : variant === "B"
        ? "Hip and glute B: hip thrusts 3 x 10, banded clamshells 3 x 15, lateral band walks 3 x 12, single-leg calf raises 3 x 15, dead bugs 3 x 10."
        : "Mobility only: hips, ankles, thoracic spine, light band work. Nothing that leaves soreness.";
  return {
    day,
    sport: "strength",
    title: variant === "mobility" ? "Mobility" : `Strength ${variant}`,
    detail,
    targetMin: min,
  };
}

/* ------------------------------------------------------------------ */
/* Session text per phase                                              */
/* ------------------------------------------------------------------ */

function swimTechniqueDetail(phase: Phase): string {
  switch (phase) {
    case "Base 1":
      return "Technique: 200 easy, then 8-12 x 50 drill/swim (catch-up, fingertip drag, side kick), 4 x 25 breathing every 3, 200 easy. Rest as needed; form over distance.";
    case "Base 2":
      return "Technique: 300 easy, 6 x 50 drill/swim, 6 x 100 steady with 20 s rest focusing on a long exhale and a high elbow catch, 200 easy.";
    case "Build 1":
      return "Technique and pull: 400 easy, 4 x 50 drill, 4 x 200 with paddles at steady effort (30 s rest), 4 x 50 fast, 200 easy.";
    case "Build 2":
      return "Technique and pull: 400 easy, 4 x 50 drill, 5 x 200 pull at race effort (20 s rest), 6 x 50 sighting practice, 200 easy.";
    case "Peak":
      return "Race skills: 400 easy, 4 x 50 drill, 3 x 300 at race pace (1:50/100 m) with 20 s rest, 8 x 25 sprint start practice, 200 easy.";
    case "Taper":
      return "Sharpen: 300 easy, 6 x 50 drill, 6 x 100 at race pace (20 s rest), 200 easy. Short and smooth.";
  }
}

function swimMainDetail(phase: Phase): string {
  switch (phase) {
    case "Base 1":
      return "Endurance: 200 easy, 10-14 x 100 steady with 20-30 s rest. Hold form; stop the set if it falls apart. 100 easy.";
    case "Base 2":
      return "Endurance: 300 easy, 3 x (4 x 100 steady, 15 s rest) with 1 min between rounds, 200 easy.";
    case "Build 1":
      return "Threshold: 400 easy, 10 x 100 at best sustainable pace (20 s rest), 4 x 50 fast, 300 easy.";
    case "Build 2":
      return "Threshold: 400 easy, 5 x 200 at race pace minus 5 s per 100 (30 s rest), 4 x 100 descending, 300 easy.";
    case "Peak":
      return "Race set: 400 easy, 3 x 500 at race pace (1:50/100 m) with 30 s rest, 200 easy. Rehearse the first 200 hard then settle.";
    case "Taper":
      return "Race feel: 300 easy, 4 x 200 at race pace (30 s rest), 4 x 50 fast, 200 easy.";
  }
}

function swimLongDetail(phase: Phase): string {
  switch (phase) {
    case "Base 1":
      return "Continuous: swim as far as you can without stopping at an easy effort, then finish with 4 x 50 easy. Breathe bilaterally.";
    case "Base 2":
      return "Continuous: 2 x half the target distance with 1 min rest, easy and relaxed. Bilateral breathing, sight every 8 strokes.";
    case "Build 1":
      return "Continuous open-water style: target distance straight through at steady effort, sighting every 6-8 strokes, 100 easy.";
    case "Build 2":
      return "Continuous: target distance straight through, the middle third at race effort, sighting practice throughout.";
    case "Peak":
      return "Race rehearsal: 1,900 m straight through at race pace in a wetsuit if possible, then 100 easy.";
    case "Taper":
      return "Easy continuous swim, relaxed and long. Finish feeling like you could go again.";
  }
}

function bikeIntervalDetail(phase: Phase, recovery: boolean): string {
  if (recovery) return "Recovery: 15 min easy, 4 x 3 min at tempo with 3 min easy, 15 min easy. No straining.";
  switch (phase) {
    case "Base 1":
      return "Cadence and sweet spot: 15 min easy, 3 x 8 min at 88-93% FTP (cadence 90+) with 4 min easy, 10 min easy.";
    case "Base 2":
      return "Sweet spot: 15 min easy, 3 x 12 min at 88-93% FTP with 4 min easy, 10 min easy.";
    case "Build 1":
      return "Threshold: 15 min easy, 4 x 8 min at 95-100% FTP with 4 min easy, 10 min easy.";
    case "Build 2":
      return "Over-unders: 15 min easy, 3 x 12 min alternating 2 min at 105% and 2 min at 90% FTP, 4 min easy between, 10 min easy.";
    case "Peak":
      return "Race pace: 15 min easy, 2 x 20 min at 70.3 target power (about 80-85% FTP, 36 kph on the road) with 5 min easy, 10 min easy.";
    case "Taper":
      return "Openers: 15 min easy, 4 x 4 min at race power with 3 min easy, 3 x 30 s fast, 10 min easy.";
  }
}

function longRideDetail(phase: Phase, min: number, recovery: boolean): string {
  if (recovery) return `${min} min easy Z2 ride, low stress. Keep cadence high and the mind quiet.`;
  switch (phase) {
    case "Base 1":
      return `${min} min Z2 endurance ride (65-75% FTP). Steady, fueled, no surges. Practice eating 60 g carbs per hour.`;
    case "Base 2":
      return `${min} min Z2 with 3 x 10 min at tempo in the back half. Aero position for the tempo blocks.`;
    case "Build 1":
      return `${min} min with 2 x 20 min at 70.3 race power (80-85% FTP) in aero, Z2 between. Then straight into the brick run.`;
    case "Build 2":
      return `${min} min with 3 x 20 min at race power in aero, Z2 between. Full race nutrition rehearsal: 80-90 g carbs per hour.`;
    case "Peak":
      return `${min} min with the last 60 min at race power (about 36 kph). Race-day kit, race-day fuel, then brick.`;
    case "Taper":
      return `${min} min easy with 3 x 10 min at race power. Check the bike, check the position, then stop.`;
  }
}

function runQualityDetail(phase: Phase, week: number, recovery: boolean): string {
  if (recovery) return "Easy run on soft ground. Knee check-in: stop at the first sign of swelling or sharp pain.";
  switch (phase) {
    case "Base 1":
      return "Easy aerobic run, conversational (Z2). Soft surface where possible. 6 x 20 s relaxed strides at the end.";
    case "Base 2":
      return week >= 7
        ? "Easy warm-up, then 3 x 6 min at tempo (around 4:30/km) with 2 min jog, easy cool-down."
        : "Easy warm-up, then 15 min steady (around 4:45/km), easy cool-down. 6 x 20 s strides.";
    case "Build 1":
      return "Warm-up, then 4 x 6 min at half-marathon effort (4:20-4:30/km) with 2 min jog, cool-down.";
    case "Build 2":
      return "Warm-up, then 5 x 5 min at threshold (4:10-4:20/km) with 90 s jog, cool-down.";
    case "Peak":
      return "Warm-up, then 3 x 10 min at 70.3 run pace (4:45/km) on tired legs, 2 min jog, cool-down.";
    case "Taper":
      return "Warm-up, 5 x 3 min at race pace with 2 min jog, 4 x 20 s strides, cool-down. Legs should feel springy.";
  }
}

function longRunDetail(phase: Phase, min: number, recovery: boolean): string {
  if (recovery) return `${min} min easy on soft ground. Recovery week: this run should feel short.`;
  switch (phase) {
    case "Base 1":
      return `${min} min easy aerobic run (Z2). Build the knee's tolerance to time on feet; walk breaks are fine.`;
    case "Base 2":
      return `${min} min easy with the last 15 min steady (around 4:50/km).`;
    case "Build 1":
      return `${min} min easy with 3 x 8 min at 70.3 run pace (4:45/km) spread through the second half.`;
    case "Build 2":
      return `${min} min with the middle 30 min at 70.3 run pace (4:45/km). Practice fueling on the run.`;
    case "Peak":
      return `${min} min with the last 30 min at race pace. Final long run of the block.`;
    case "Taper":
      return `${min} min easy with 10 min at race pace. Shorter than it feels like it should be, on purpose.`;
  }
}

/* ------------------------------------------------------------------ */
/* Week builder                                                        */
/* ------------------------------------------------------------------ */

function buildWeek(spec: WeekSpec): PlanSession[] {
  const { week } = spec;
  const phase = phaseOf(week);
  const recovery = Boolean(spec.recovery);
  const benchmark = week === 4 || week === 8 || week === 16;
  const drafts: Draft[] = [];

  if (week === WEEKS) return buildRaceWeek(spec);

  // Tuesday: technique swim + bike intervals (or FTP test on benchmark weeks).
  drafts.push(swim(week, "tue", spec.swim[0], "Swim: technique", swimTechniqueDetail(phase)));
  if (benchmark) {
    drafts.push(
      bike(
        "tue",
        spec.bikeInt,
        "20 min FTP test",
        "Benchmark: 20 min easy with 3 x 1 min fast, 5 min easy, 20 min all-out time trial, 10 min easy. FTP is 95% of the 20 min average. Set zones from this."
      )
    );
  } else {
    drafts.push(bike("tue", spec.bikeInt, "Bike: intervals", bikeIntervalDetail(phase, recovery)));
  }

  // Wednesday: quality run (or 5 km TT on benchmark weeks) + strength A.
  if (benchmark) {
    drafts.push(
      run(
        "wed",
        spec.runQ,
        "5 km run time trial",
        "Benchmark: 12 min easy, 4 x 20 s strides, then 5 km as fast as the knee allows on a flat loop or track, 10 min easy. Compare to last block."
      )
    );
  } else {
    drafts.push(run("wed", spec.runQ, phase === "Base 1" ? "Run: easy" : "Run: quality", runQualityDetail(phase, week, recovery)));
  }
  if (spec.strength >= 1) drafts.push(strength("wed", recovery ? 30 : 40, "A"));

  // Thursday: main-set swim (or 400 m TT) + easy run in Base.
  if (benchmark && week !== 16) {
    drafts.push({
      ...swim(week, "thu", spec.swim[1], "400 m swim time trial", ""),
      detail:
        "Benchmark: 300 easy, 4 x 50 build, 2 min rest, 400 m all-out (note the time and stroke count), 200 easy. This sets swim pace targets for the next block.",
    });
  } else {
    drafts.push(swim(week, "thu", spec.swim[1], "Swim: main set", swimMainDetail(phase)));
  }
  if (spec.runE > 0) {
    drafts.push(run("thu", spec.runE, "Run: easy", "Easy aerobic run, conversational. Soft surface. Stop early if the knee complains."));
  }

  // Friday: easy spin + strength B.
  drafts.push(
    bike(
      "fri",
      spec.bikeEasy,
      "Bike: easy spin",
      recovery
        ? "Very easy spin, cadence 90+, legs only. Watch something and forget you are training."
        : "Easy Z1-Z2 spin, cadence 90-100. Flush the legs; include 4 x 30 s high-cadence spin-ups.",
      28
    )
  );
  if (spec.strength === 2) drafts.push(strength("fri", 40, "B"));

  // Saturday: long ride (+ brick run). Week 18 is the race simulation.
  if (week === 18) {
    drafts.push({
      ...swim(week, "sat", 1.9, "Race simulation: swim", ""),
      detail: "Race simulation, part 1: 1,900 m continuous at race pace, wetsuit if the water allows. Transition quickly to the bike.",
      targetMin: 40,
    });
    drafts.push(
      bike("sat", spec.longRide, "Race simulation: bike", `Race simulation, part 2: ${spec.longRide} min at 70.3 race power in aero (about 36 kph), full race nutrition, race kit. Straight into the run.`, 35)
    );
    drafts.push(run("sat", spec.brick, "Race simulation: run", `Race simulation, part 3: ${spec.brick} min at 70.3 run pace (4:45/km) off the bike. Note HR, pace and how the knee feels.`));
  } else if (spec.longRide > 0) {
    drafts.push(bike("sat", spec.longRide, "Long ride", longRideDetail(phase, spec.longRide, recovery)));
    if (spec.brick > 0) {
      drafts.push(
        run(
          "sat",
          spec.brick,
          "Brick run",
          `${spec.brick} min off the bike within 5 min of racking. Start at race pace (4:45/km), settle into steady. Transition practice counts.`
        )
      );
    }
  }

  // Sunday: long run + continuous swim.
  if (spec.longRun > 0) {
    drafts.push(run("sun", spec.longRun, "Long run", week === 18 ? `${spec.longRun} min very easy the day after the simulation. Shake-out only.` : longRunDetail(phase, spec.longRun, recovery)));
  }
  if (spec.swim[2] > 0) {
    drafts.push(swim(week, "sun", spec.swim[2], "Swim: continuous", week === 18 ? "Easy continuous recovery swim. Loosen the shoulders." : swimLongDetail(phase)));
  }

  return drafts.map((d) => session(week, d));
}

function buildRaceWeek(spec: WeekSpec): PlanSession[] {
  const { week } = spec;
  const drafts: Draft[] = [
    swim(week, "tue", spec.swim[0], "Swim: sharpen", swimTechniqueDetail("Taper")),
    bike("tue", spec.bikeInt, "Bike: openers", "15 min easy, 4 x 3 min at race power with 3 min easy, 10 min easy. Last real effort before the race."),
    run("wed", spec.runQ, "Run: strides", "20 min easy, 6 x 20 s strides, 5 min easy. Legs should feel light."),
    swim(week, "thu", spec.swim[1], "Swim: easy", "Easy continuous swim with 4 x 50 at race pace. Travel day prep: pack, hydrate."),
    bike("fri", spec.bikeEasy, "Bike: shake-out", "30 min very easy spin on the race bike after reassembly. Check gears, brakes, bottles, tire pressure.", 28),
    run("fri", 15, "Run: shake-out", "15 min easy jog with 4 x 15 s pick-ups. Check in, rack the bike, lay out kit."),
    {
      day: "sat",
      sport: "swim",
      title: "Course swim",
      detail: "15-20 min easy in the race venue water if open, 4 x 30 s at race effort. Otherwise rest. Feet up the rest of the day.",
      targetMin: 20,
      targetKm: 0.6,
    },
    {
      day: "sun",
      sport: "swim",
      title: "70.3 Texas: swim",
      detail: "Race day. 1.9 km. Target 35 min: first 200 m controlled, settle, sight every 6 strokes, draft when you can.",
      targetMin: 35,
      targetKm: 1.9,
    },
    {
      day: "sun",
      sport: "bike",
      title: "70.3 Texas: bike",
      detail: "Race day. 90 km. Target 2:30 at about 36 kph. Hold race power, eat 80-90 g carbs per hour, stay aero, no heroics into the wind.",
      targetMin: 150,
      targetKm: 90,
    },
    {
      day: "sun",
      sport: "run",
      title: "70.3 Texas: run",
      detail: "Race day. 21.1 km. Target 1:40 at 4:45/km. First 3 km controlled, then settle. Sub-5:00 overall is the goal.",
      targetMin: 100,
      targetKm: 21.1,
    },
  ];
  return drafts.map((d) => session(week, d));
}

/* ------------------------------------------------------------------ */
/* Assemble, validate, write                                           */
/* ------------------------------------------------------------------ */

const plan: PlanSession[] = WEEK_TABLE.flatMap(buildWeek);

// Sanity checks before writing.
const ids = new Set<string>();
for (const s of plan) {
  if (ids.has(s.id)) throw new Error(`duplicate id ${s.id}`);
  ids.add(s.id);
}
if (WEEK_TABLE.length !== WEEKS) throw new Error(`expected ${WEEKS} weeks, got ${WEEK_TABLE.length}`);
if (!plan.some((s) => s.date === RACE_DATE)) throw new Error("race date missing");

const out = join(dirname(new URL(import.meta.url).pathname), "..", "data", "plan.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(plan, null, 2) + "\n");

// Report weekly hours per phase so the progression can be eyeballed.
const byWeek = new Map<number, number>();
for (const s of plan) byWeek.set(s.week, (byWeek.get(s.week) ?? 0) + (s.targetMin ?? 0));
const lines: string[] = [];
for (const spec of WEEK_TABLE) {
  const min = byWeek.get(spec.week) ?? 0;
  const prev = byWeek.get(spec.week - 1);
  const ratio = spec.recovery && prev ? ` (${Math.round((min / prev) * 100)}% of wk ${spec.week - 1})` : "";
  lines.push(`wk ${String(spec.week).padStart(2)}  ${phaseOf(spec.week).padEnd(7)}  ${(min / 60).toFixed(1).padStart(5)} h${ratio}`);
}
console.log(lines.join("\n"));
console.log(`\n${plan.length} sessions written to ${out}`);
