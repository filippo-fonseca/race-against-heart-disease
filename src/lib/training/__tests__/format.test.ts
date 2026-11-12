import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtAgo } from "../../../components/training/format";

test("fmtAgo reads like a feed timestamp", () => {
  const now = new Date("2026-11-12T18:00:00-05:00");
  assert.equal(fmtAgo("2026-11-12T17:59:30-05:00", now), "just now");
  assert.equal(fmtAgo("2026-11-12T17:48:00-05:00", now), "12m ago");
  assert.equal(fmtAgo("2026-11-12T15:00:00-05:00", now), "3h ago");
  assert.equal(fmtAgo("2026-11-11T16:00:00-05:00", now), "yesterday");
  assert.equal(fmtAgo("2026-11-08T07:00:00-05:00", now), "4 days ago");
  assert.equal(fmtAgo("2026-10-20T07:00:00-05:00", now), "Oct 20");
  assert.equal(fmtAgo("not a date", now), "");
});
