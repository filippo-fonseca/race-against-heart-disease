import "server-only";
import { connection } from "next/server";
import { TRAINING_DAYS, TRAINING_START, inWindow, todayISO } from "@/lib/training/dates";
import { loadTraining } from "@/lib/training/load";
import { FEED_PAGE_WEEKS, buildFeed, dayLinks } from "./model";
import { buildSkyline, type SkylineDay } from "./skyline";

/**
 * Skyline days from the cached Strava data, for /training/3d and the letter's
 * hero. Reads today, so callers render it at request time (inside Suspense).
 * Day links match the calendar on /training: each opens its card, loading
 * older weeks when needed.
 */
export async function loadSkylineDays(): Promise<SkylineDay[]> {
  await connection();
  const today = todayISO();
  const { activities: all } = await loadTraining();
  const activities = all.filter((a) => inWindow(a.date) && a.date <= today);
  const links = dayLinks(buildFeed(activities), FEED_PAGE_WEEKS, (n) =>
    n > FEED_PAGE_WEEKS ? `/training?weeks=${n}` : "/training",
  );
  return buildSkyline({ activities, start: TRAINING_START, totalDays: TRAINING_DAYS, today, links });
}
