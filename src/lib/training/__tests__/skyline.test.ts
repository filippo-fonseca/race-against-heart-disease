import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSkyline, pickCallouts, totalMinutes } from "../../../components/training/skyline";
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

test("pickCallouts favours days with photos and never picks empty days", () => {
  const acts = [
    activity({ date: "2026-11-02", sport: "run", startLocal: "2026-11-02T06:00:00-06:00" }),
    activity({ date: "2026-11-03", sport: "bike", startLocal: "2026-11-03T06:00:00-06:00", photos: [{ id: "p", url: "https://x/p.jpg", width: null, height: null, caption: null }] }),
    activity({ date: "2026-11-05", sport: "swim", startLocal: "2026-11-05T06:00:00-06:00" }),
  ];
  const days = buildSkyline({ activities: acts, start: "2026-11-02", totalDays: 154, today: "2026-11-10", links: new Map() });
  assert.equal(days[1].photo?.url, "https://x/p.jpg");
  let seed = 0.42;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280 / 233280);
  const one = pickCallouts(days, 1, rand);
  assert.deepEqual(one, [1], "the photo day comes first");
  const all = pickCallouts(days, 5, rand);
  assert.deepEqual(all, [0, 1, 3], "only trained days, in day order");
});
