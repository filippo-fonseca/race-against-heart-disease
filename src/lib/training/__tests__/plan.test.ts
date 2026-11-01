import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAN_START, PLAN_WEEKS, RACE_DATE, daysToRace, getPlan, planWindow, sessionsOn, validatePlan, weekOf } from "../plan";
import { addDays, weekday } from "../dates";

const plan = getPlan();

test("plan loads, validates and spans 22 weeks", () => {
  assert.ok(plan.length > 200);
  const weeks = new Set(plan.map((s) => s.week));
  assert.equal(weeks.size, PLAN_WEEKS);
  for (let w = 1; w <= PLAN_WEEKS; w += 1) assert.ok(weeks.has(w), `week ${w} has sessions`);
});

test("ids are unique and dates sit inside the program window", () => {
  const ids = new Set(plan.map((s) => s.id));
  assert.equal(ids.size, plan.length);
  const { from, to } = planWindow();
  assert.equal(from, PLAN_START);
  assert.equal(to, RACE_DATE);
  for (const s of plan) {
    assert.ok(s.date >= from && s.date <= to, `${s.id} inside window`);
  }
});

test("every session's date falls in its own week, weeks run Monday to Sunday", () => {
  for (const s of plan) {
    const w = weekOf(s.date);
    assert.equal(w.week, s.week, `${s.id} week`);
    assert.equal(w.phase, s.phase, `${s.id} phase`);
    assert.equal(weekday(w.start), "mon");
    assert.equal(weekday(w.end), "sun");
    assert.equal(addDays(w.start, 6), w.end);
  }
  assert.equal(weekday(PLAN_START), "mon");
  assert.equal(weekday(RACE_DATE), "sun");
});

test("weeks are contiguous with no gaps", () => {
  const starts = [...new Set(plan.map((s) => weekOf(s.date).start))].sort();
  assert.equal(starts.length, PLAN_WEEKS);
  for (let i = 1; i < starts.length; i += 1) {
    assert.equal(starts[i], addDays(starts[i - 1], 7));
  }
});

test("Monday is always a rest day for both athletes", () => {
  for (let w = 0; w < PLAN_WEEKS; w += 1) {
    const monday = addDays(PLAN_START, w * 7);
    assert.deepEqual(sessionsOn(monday, "filippo"), []);
    assert.deepEqual(sessionsOn(monday, "amir"), []);
  }
});

test("phases cover the right weeks", () => {
  const expect: Record<string, [number, number]> = {
    "Base 1": [1, 4],
    "Base 2": [5, 8],
    "Build 1": [9, 12],
    "Build 2": [13, 16],
    Peak: [17, 19],
    Taper: [20, 22],
  };
  for (const [phase, [lo, hi]] of Object.entries(expect)) {
    const weeks = plan.filter((s) => s.phase === phase).map((s) => s.week);
    assert.equal(Math.min(...weeks), lo, `${phase} starts`);
    assert.equal(Math.max(...weeks), hi, `${phase} ends`);
  }
});

test("race day is present with all three legs and the simulation lands in Peak", () => {
  const race = sessionsOn(RACE_DATE, "filippo");
  assert.deepEqual(race.map((s) => s.sport).sort(), ["bike", "run", "swim"]);
  assert.ok(race.every((s) => s.week === PLAN_WEEKS));
  const sim = plan.filter((s) => s.title.startsWith("Race simulation"));
  assert.equal(sim.length, 3);
  assert.ok(sim.every((s) => s.phase === "Peak"));
});

test("every full training week has 3 swims, 3 bikes, 3 runs and benchmarks land at block ends", () => {
  for (let w = 1; w < PLAN_WEEKS; w += 1) {
    const sessions = plan.filter((s) => s.week === w);
    const count = (sport: string) => sessions.filter((s) => s.sport === sport).length;
    assert.equal(count("swim"), 3, `week ${w} swims`);
    assert.equal(count("bike"), 3, `week ${w} bikes`);
    assert.equal(count("run"), 3, `week ${w} runs`);
  }
  const ftp = plan.filter((s) => s.title.includes("FTP")).map((s) => s.week);
  assert.deepEqual(ftp, [4, 8, 16]);
  const swimTT = plan.filter((s) => s.title.includes("400 m")).map((s) => s.week);
  assert.deepEqual(swimTT, [4, 8]);
});

test("recovery weeks sit at 60-72% of the week before", () => {
  const minutes = (w: number) => plan.filter((s) => s.week === w).reduce((n, s) => n + (s.targetMin ?? 0), 0);
  for (const w of [4, 8, 12, 16]) {
    const ratio = minutes(w) / minutes(w - 1);
    assert.ok(ratio >= 0.6 && ratio <= 0.72, `week ${w} ratio ${ratio.toFixed(2)}`);
  }
});

test("weekOf works outside the window and daysToRace counts down", () => {
  assert.equal(weekOf("2026-10-28").week, 0);
  assert.equal(weekOf("2026-10-28").phase, null);
  assert.equal(weekOf("2026-11-02").week, 1);
  assert.equal(weekOf("2026-11-08").week, 1);
  assert.equal(weekOf("2026-11-09").week, 2);
  assert.equal(weekOf("2027-04-04").week, 22);
  assert.equal(weekOf("2027-04-05").week, 23);
  assert.equal(daysToRace("2026-11-02"), 153);
  assert.equal(daysToRace(RACE_DATE), 0);
});

test("validatePlan rejects malformed sessions", () => {
  assert.throws(() => validatePlan("nope"), /array/);
  assert.throws(() => validatePlan([{ ...plan[0], sport: "rowing" }]), /unknown sport/);
  assert.throws(() => validatePlan([{ ...plan[0], date: "11/02/2026" }]), /YYYY-MM-DD/);
  assert.throws(() => validatePlan([plan[0], plan[0]]), /duplicate id/);
  assert.throws(() => validatePlan([{ ...plan[0], athletes: ["someone"] }]), /athletes/);
});

test("prose carries no em or en dashes", () => {
  for (const s of plan) {
    assert.doesNotMatch(s.title, /[–—]/, s.id);
    if (s.detail) assert.doesNotMatch(s.detail, /[–—]/, s.id);
  }
});
