import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketOf, toSport } from "../types";

test("rides of every kind are BIKE, indoor or out", () => {
  for (const t of ["Ride", "VirtualRide", "EBikeRide", "GravelRide", "MountainBikeRide", "Velomobile", "Handcycle"]) {
    assert.equal(toSport(t), "bike", t);
  }
});

test("swims and runs keep their buckets", () => {
  assert.equal(toSport("Swim"), "swim");
  for (const t of ["Run", "TrailRun", "VirtualRun"]) assert.equal(toSport(t), "run", t);
});

test("everything else is LIFT, HIIT included", () => {
  for (const t of ["HighIntensityIntervalTraining", "WeightTraining", "Workout", "Crossfit", "Yoga", "Pilates", "Walk", "Hike", "Rowing", ""]) {
    assert.equal(toSport(t), "strength", t);
  }
});

test("the legacy other bucket folds into LIFT", () => {
  assert.equal(bucketOf("other"), "strength");
  assert.equal(bucketOf("bike"), "bike");
});
