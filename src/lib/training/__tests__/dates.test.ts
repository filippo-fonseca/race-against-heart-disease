import { test } from "node:test";
import assert from "node:assert/strict";
import { site } from "../../site";
import {
  RACE_DAY,
  TRAINING_DAYS,
  TRAINING_START,
  TRAINING_WEEKS,
  dayNumber,
  daysToRace,
  inWindow,
  todayISO,
  weekNumber,
  weekStartFor,
  weekday,
  weeksElapsed,
} from "../dates";

test("the window runs from Monday Nov 2 (day 1) to race day, Sunday Apr 4 (day 154)", () => {
  assert.equal(TRAINING_START, "2026-11-02");
  assert.equal(weekday(TRAINING_START), "mon");
  assert.equal(weekday(RACE_DAY), "sun");
  assert.equal(TRAINING_DAYS, 154);
  assert.equal(TRAINING_WEEKS, 22);
  assert.equal(dayNumber(TRAINING_START), 1);
  assert.equal(dayNumber("2026-11-08"), 7);
  assert.equal(dayNumber(RACE_DAY), 154);
});

test("race day matches site.race.date in race-local time", () => {
  assert.equal(todayISO("America/Chicago", site.race.date), RACE_DAY);
  assert.equal(daysToRace(RACE_DAY), 0);
  assert.equal(daysToRace(TRAINING_START), 153);
});

test("weeks start Monday and number from the window start", () => {
  assert.equal(weekNumber("2026-11-02"), 1);
  assert.equal(weekNumber("2026-11-08"), 1);
  assert.equal(weekNumber("2026-11-09"), 2);
  assert.equal(weekNumber(RACE_DAY), 22);
  assert.equal(weekStartFor(22), "2027-03-29");
});

test("inWindow includes both ends only", () => {
  assert.ok(inWindow(TRAINING_START));
  assert.ok(inWindow(RACE_DAY));
  assert.ok(!inWindow("2026-11-01"));
  assert.ok(!inWindow("2027-04-05"));
});

test("weeksElapsed floors at one week, grows by day, and caps at race day", () => {
  assert.equal(weeksElapsed("2026-11-01"), 0);
  assert.equal(weeksElapsed(TRAINING_START), 1);
  assert.equal(weeksElapsed("2026-11-08"), 1);
  assert.equal(weeksElapsed("2026-11-15"), 2);
  assert.equal(weeksElapsed("2026-11-11"), 10 / 7);
  assert.equal(weeksElapsed(RACE_DAY), 22);
  assert.equal(weeksElapsed("2027-05-01"), 22);
});
