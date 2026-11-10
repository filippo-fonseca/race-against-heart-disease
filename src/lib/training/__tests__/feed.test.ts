import { test } from "node:test";
import assert from "node:assert/strict";
import { FEED_PAGE_WEEKS, buildFeed, dayLinks, feedWeeksShown } from "../../../components/training/model";
import { activity } from "./fixtures";

test("feedWeeksShown clamps to one page minimum and the available weeks maximum", () => {
  assert.equal(feedWeeksShown(undefined, 10), FEED_PAGE_WEEKS);
  assert.equal(feedWeeksShown("abc", 10), FEED_PAGE_WEEKS);
  assert.equal(feedWeeksShown("-3", 10), FEED_PAGE_WEEKS);
  assert.equal(feedWeeksShown("1", 10), FEED_PAGE_WEEKS);
  assert.equal(feedWeeksShown("8", 10), 8);
  assert.equal(feedWeeksShown("50", 10), 10);
  assert.equal(feedWeeksShown(undefined, 2), 2);
  assert.equal(feedWeeksShown(undefined, 0), 0);
});

test("dayLinks point at the day anchor and widen the page for older weeks", () => {
  const acts = ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01", "2026-12-08"].map((date) =>
    activity({ date, sport: "run", startLocal: `${date}T07:00:00-06:00` }),
  );
  const weeks = buildFeed(acts);
  const links = dayLinks(weeks, 4, (n) => `/training?weeks=${n}`);
  assert.equal(links.get("2026-12-08"), "/training?weeks=4#day-2026-12-08");
  assert.equal(links.get("2026-11-17"), "/training?weeks=4#day-2026-11-17");
  assert.equal(links.get("2026-11-10"), "/training?weeks=5#day-2026-11-10");
  assert.equal(links.get("2026-11-03"), "/training?weeks=6#day-2026-11-03");
  assert.equal(links.get("2026-11-04"), undefined);
});
