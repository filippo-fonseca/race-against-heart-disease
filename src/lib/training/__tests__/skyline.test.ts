import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSkyline, totalMinutes } from "../../../components/training/skyline";
import { activity } from "./fixtures";

test("buildSkyline lays every day on a week x weekday grid with minutes per sport", () => {
  const acts = [
    activity({ date: "2026-11-02", sport: "swim", movingTimeSec: 1800, startLocal: "2026-11-02T06:00:00-06:00" }),
    activity({ date: "2026-11-02", sport: "bike", movingTimeSec: 3600, startLocal: "2026-11-02T17:00:00-06:00" }),
    activity({ date: "2026-11-10", sport: "other", movingTimeSec: 600, startLocal: "2026-11-10T07:00:00-06:00" }),
  ];
  const links = new Map([["2026-11-02", "/training#day-2026-11-02"]]);
  const days = buildSkyline({ activities: acts, start: "2026-11-02", totalDays: 154, today: "2026-11-10", links });
  assert.equal(days.length, 154);
  assert.deepEqual([days[0].week, days[0].weekday, days[0].day], [0, 0, 1], "Nov 2 is Monday of week 1");
  assert.equal(days[0].minutes.swim, 30);
  assert.equal(days[0].minutes.bike, 60);
  assert.equal(totalMinutes(days[0]), 90);
  assert.deepEqual(days[0].sessions.map((s) => s.sport), ["swim", "bike"], "sessions in start order");
  assert.equal(days[0].href, "/training#day-2026-11-02");
  assert.equal(days[8].minutes.strength, 10, "legacy other counts as LIFT");
  assert.equal(days[8].when, "today");
  assert.equal(days[7].when, "past");
  assert.equal(days[9].when, "future");
  assert.deepEqual([days[153].week, days[153].weekday], [21, 6], "race day is the last Sunday");
});
