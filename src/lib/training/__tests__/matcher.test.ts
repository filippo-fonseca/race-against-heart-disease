import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMatches, matchDay, summarize } from "../matcher";
import { activity, planned } from "./fixtures";

const TODAY = "2026-11-20";

test("no plan and no activity is a rest day", () => {
  const m = matchDay("2026-11-16", "filippo", [], [], TODAY);
  assert.equal(m.status, "rest");
  assert.equal(summarize(m), "Rest day.");
});

test("future plan with nothing logged is upcoming; today counts as upcoming too", () => {
  const plan = [planned({ date: "2026-11-24", sport: "bike" }), planned({ date: TODAY, sport: "run" })];
  assert.equal(matchDay("2026-11-24", "filippo", plan, [], TODAY).status, "upcoming");
  assert.equal(matchDay(TODAY, "filippo", plan, [], TODAY).status, "upcoming");
});

test("past plan with nothing logged is missed", () => {
  const plan = [planned({ date: "2026-11-17", sport: "swim", targetMin: 40 })];
  const m = matchDay("2026-11-17", "filippo", plan, [], TODAY);
  assert.equal(m.status, "missed");
  assert.match(summarize(m), /Nothing logged\.$/);
});

test("same sport at or above 75% of the time target is done", () => {
  const plan = [planned({ date: "2026-11-17", sport: "bike", targetMin: 60, title: "Bike: Z2 ride" })];
  const acts = [activity({ date: "2026-11-17", sport: "bike", movingTimeSec: 45 * 60, avgHr: 145 })];
  const m = matchDay("2026-11-17", "filippo", plan, acts, TODAY);
  assert.equal(m.status, "done");
  assert.equal(summarize(m), "Planned 60 min z2 ride. Rode 45 min, avg 145 bpm.");
});

test("distance target satisfies when time falls short", () => {
  const plan = [planned({ date: "2026-11-17", sport: "swim", targetMin: 40, targetKm: 1.4 })];
  const acts = [activity({ date: "2026-11-17", sport: "swim", movingTimeSec: 20 * 60, distanceM: 1100 })];
  assert.equal(matchDay("2026-11-17", "filippo", plan, acts, TODAY).status, "done");
});

test("same sport below threshold is partial", () => {
  const plan = [planned({ date: "2026-11-17", sport: "run", targetMin: 60, targetKm: 12 })];
  const acts = [activity({ date: "2026-11-17", sport: "run", movingTimeSec: 30 * 60, distanceM: 6000 })];
  const m = matchDay("2026-11-17", "filippo", plan, acts, TODAY);
  assert.equal(m.status, "partial");
  assert.match(summarize(m), /Short of the target\./);
});

test("different sport than planned is partial", () => {
  const plan = [planned({ date: "2026-11-17", sport: "run", targetMin: 45 })];
  const acts = [activity({ date: "2026-11-17", sport: "bike", movingTimeSec: 60 * 60 })];
  const m = matchDay("2026-11-17", "filippo", plan, acts, TODAY);
  assert.equal(m.status, "partial");
  assert.match(summarize(m), /No run logged\./);
});

test("two planned sports need both to be done", () => {
  const plan = [
    planned({ date: "2026-11-17", sport: "swim", targetMin: 40 }),
    planned({ date: "2026-11-17", sport: "bike", targetMin: 60 }),
  ];
  const swimOnly = [activity({ date: "2026-11-17", sport: "swim", movingTimeSec: 40 * 60 })];
  assert.equal(matchDay("2026-11-17", "filippo", plan, swimOnly, TODAY).status, "partial");
  const both = [...swimOnly, activity({ date: "2026-11-17", sport: "bike", movingTimeSec: 50 * 60 })];
  assert.equal(matchDay("2026-11-17", "filippo", plan, both, TODAY).status, "done");
});

test("split uploads of one sport are summed", () => {
  const plan = [planned({ date: "2026-11-17", sport: "bike", targetMin: 120 })];
  const acts = [
    activity({ date: "2026-11-17", sport: "bike", movingTimeSec: 50 * 60 }),
    activity({ date: "2026-11-17", sport: "bike", movingTimeSec: 45 * 60 }),
  ];
  assert.equal(matchDay("2026-11-17", "filippo", plan, acts, TODAY).status, "done");
});

test("unplanned activity on a free day is done, not rest", () => {
  const acts = [activity({ date: "2026-11-16", sport: "run", movingTimeSec: 30 * 60 })];
  const m = matchDay("2026-11-16", "filippo", [], acts, TODAY);
  assert.equal(m.status, "done");
  assert.match(summarize(m), /^Unplanned\./);
});

test("sessions and activities for the other athlete are ignored", () => {
  const plan = [planned({ date: "2026-11-17", sport: "run", athletes: ["emir"] })];
  const acts = [activity({ date: "2026-11-17", sport: "run", athlete: "emir" })];
  const m = matchDay("2026-11-17", "filippo", plan, acts, TODAY);
  assert.equal(m.status, "rest");
  assert.equal(m.planned.length, 0);
  assert.equal(m.actual.length, 0);
});

test("buildMatches returns one entry per day in order", () => {
  const plan = [planned({ date: "2026-11-17", sport: "bike" }), planned({ date: "2026-11-19", sport: "run" })];
  const acts = [activity({ date: "2026-11-17", sport: "bike", movingTimeSec: 3600 })];
  const out = buildMatches({ from: "2026-11-16", to: "2026-11-19" }, "filippo", plan, acts, TODAY);
  assert.deepEqual(
    out.map((m) => [m.date, m.status]),
    [
      ["2026-11-16", "rest"],
      ["2026-11-17", "done"],
      ["2026-11-18", "rest"],
      ["2026-11-19", "missed"],
    ]
  );
});

test("summaries never contain dashes used as punctuation", () => {
  const plan = [planned({ date: "2026-11-17", sport: "run", targetMin: 45, title: "Run: quality" })];
  const acts = [activity({ date: "2026-11-17", sport: "run", movingTimeSec: 40 * 60, distanceM: 8200, avgHr: 150 })];
  const text = summarize(matchDay("2026-11-17", "filippo", plan, acts, TODAY));
  assert.equal(text, "Planned 45 min quality. Ran 8.2 km in 40 min, avg 150 bpm.");
  assert.doesNotMatch(text, /[–—]/);
});
