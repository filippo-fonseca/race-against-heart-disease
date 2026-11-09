import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarCells, cumulativeTime, hrBuckets, streakDays, summary, weeklyTotals } from "../aggregate";
import { activity } from "./fixtures";

test("weekly totals bucket by Monday across a month boundary", () => {
  // 2026-11-30 is a Monday; the week runs into December.
  const acts = [
    activity({ date: "2026-11-29", sport: "run", movingTimeSec: 1800 }), // Sunday of the prior week
    activity({ date: "2026-11-30", sport: "bike", movingTimeSec: 3600, distanceM: 30000 }),
    activity({ date: "2026-12-02", sport: "swim", movingTimeSec: 2400, distanceM: 1500 }),
    activity({ date: "2026-12-06", sport: "run", movingTimeSec: 2700 }), // Sunday of the same week
    activity({ date: "2026-12-07", sport: "run", movingTimeSec: 600 }), // next Monday
  ];
  const rows = weeklyTotals(acts);
  assert.deepEqual(
    rows.map((r) => r.weekStart),
    ["2026-11-23", "2026-11-30", "2026-12-07"]
  );
  const wk = rows[1];
  assert.equal(wk.totalTimeSec, 3600 + 2400 + 2700);
  assert.equal(wk.bySport.bike.distanceM, 30000);
  assert.equal(wk.bySport.run.count, 1);
  assert.equal(rows[0].totalTimeSec, 1800);
  assert.equal(rows[2].totalTimeSec, 600);
});

test("weekly totals fill empty weeks between first and last so charts are contiguous", () => {
  const acts = [
    activity({ date: "2026-11-02", sport: "run", movingTimeSec: 600 }),
    activity({ date: "2026-11-25", sport: "run", movingTimeSec: 600 }),
  ];
  const rows = weeklyTotals(acts);
  assert.equal(rows.length, 4);
  assert.equal(rows[1].totalTimeSec, 0);
  assert.equal(rows[2].totalTimeSec, 0);
});

test("weekly totals respect a clamped range", () => {
  const acts = [
    activity({ date: "2026-11-03", sport: "run", movingTimeSec: 600 }),
    activity({ date: "2026-12-25", sport: "run", movingTimeSec: 600 }),
  ];
  const rows = weeklyTotals(acts, { from: "2026-11-02", to: "2026-11-15" });
  assert.deepEqual(
    rows.map((r) => r.weekStart),
    ["2026-11-02", "2026-11-09"]
  );
  assert.equal(rows[0].totalTimeSec, 600);
});

test("streak counts back from today and survives an empty today", () => {
  const acts = ["2026-11-17", "2026-11-18", "2026-11-19"].map((date) => activity({ date, sport: "run" }));
  assert.equal(streakDays(acts, "2026-11-19"), 3);
  assert.equal(streakDays(acts, "2026-11-20"), 3, "today not over yet");
  assert.equal(streakDays(acts, "2026-11-21"), 0, "yesterday was empty");
  assert.equal(streakDays([], "2026-11-21"), 0);
});

test("streak breaks on a gap and two sessions in one day count once", () => {
  const acts = [
    activity({ date: "2026-11-15", sport: "run" }),
    activity({ date: "2026-11-17", sport: "swim" }),
    activity({ date: "2026-11-17", sport: "bike" }),
    activity({ date: "2026-11-18", sport: "run" }),
  ];
  assert.equal(streakDays(acts, "2026-11-18"), 2);
});

test("summary totals since a date, legacy other counted as LIFT", () => {
  const acts = [
    activity({ date: "2026-11-01", sport: "run", movingTimeSec: 1000, distanceM: 3000 }), // before since
    activity({ date: "2026-11-02", sport: "swim", movingTimeSec: 2000, distanceM: 1200 }),
    activity({ date: "2026-11-03", sport: "bike", movingTimeSec: 3000, distanceM: 25000 }),
    activity({ date: "2026-11-03", sport: "other", movingTimeSec: 500 }),
  ];
  const s = summary(acts, "2026-11-02", "2026-11-03");
  assert.equal(s.sessions, 3);
  assert.equal(s.totalTimeSec, 5500);
  assert.equal(s.bySport.strength.timeSec, 500);
  assert.equal(s.totalDistanceM, 26200);
  assert.equal(s.streakDays, 2);
  assert.equal(s.bySport.run.count, 0);
  assert.equal(s.bySport.bike.distanceM, 25000);
});

test("calendar cells cover every day and list sports once each", () => {
  const acts = [
    activity({ date: "2026-11-03", sport: "swim", movingTimeSec: 1800, startLocal: "2026-11-03T06:00:00-05:00" }),
    activity({ date: "2026-11-03", sport: "bike", movingTimeSec: 3600, startLocal: "2026-11-03T18:00:00-05:00" }),
    activity({ date: "2026-11-03", sport: "bike", movingTimeSec: 600, startLocal: "2026-11-03T19:30:00-05:00" }),
  ];
  const cells = calendarCells(acts, "2026-11-02", "2026-11-04");
  assert.equal(cells.length, 3);
  assert.equal(cells[0].timeSec, 0);
  assert.deepEqual(cells[1].sports, ["swim", "bike"]);
  assert.equal(cells[1].timeSec, 6000);
  assert.equal(cells[1].count, 3);
});

test("hr buckets span the data in fixed-width bins", () => {
  const acts = [
    activity({ date: "2026-11-03", sport: "run", avgHr: 142, movingTimeSec: 1000 }),
    activity({ date: "2026-11-04", sport: "run", avgHr: 148, movingTimeSec: 2000 }),
    activity({ date: "2026-11-05", sport: "bike", avgHr: 161, movingTimeSec: 500 }),
    activity({ date: "2026-11-06", sport: "strength", avgHr: null }),
  ];
  const b = hrBuckets(acts);
  assert.deepEqual(
    b.map((x) => [x.label, x.count, x.timeSec]),
    [
      ["140-149", 2, 3000],
      ["150-159", 0, 0],
      ["160-169", 1, 500],
    ]
  );
  assert.deepEqual(hrBuckets([]), []);
});

test("cumulative time runs forward by day per sport, indoor rides included", () => {
  const acts = [
    activity({ date: "2026-11-02", sport: "run", movingTimeSec: 1800, distanceM: 5000 }),
    activity({ date: "2026-11-04", sport: "bike", movingTimeSec: 3600, distanceM: 0 }),
    activity({ date: "2026-11-04", sport: "other", movingTimeSec: 600 }),
    activity({ date: "2026-11-09", sport: "run", movingTimeSec: 999 }), // outside the range
  ];
  const c = cumulativeTime(acts, "2026-11-02", "2026-11-05");
  assert.deepEqual(c.run, [1800, 1800, 1800, 1800]);
  assert.deepEqual(c.bike, [0, 0, 3600, 3600]);
  assert.deepEqual(c.strength, [0, 0, 600, 600]);
  assert.deepEqual(c.swim, [0, 0, 0, 0]);
});
