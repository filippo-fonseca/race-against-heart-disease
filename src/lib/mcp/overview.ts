import { formatUsd, getFundraising } from "../fundraising";
import { db } from "../training/db";
import { listAthletes } from "../training/queries";
import type { AthleteSlug } from "../training/types";
import { sportTotals, type TotalsRow } from "./activity-logic";
import { ATHLETE_SLUGS, ATHLETE_TIME_ZONE, todayForAthletes, TRAINING_START_DATE, trainingWindow } from "./validate";

/**
 * Read-only tools: get_overview and get_fundraising. Server only (Supabase).
 * The site is retroactive: it shows what was done (Strava activities) over
 * the training window, with no plan.
 */

interface ActivityTotalsRow extends TotalsRow {
  athlete_slug: AthleteSlug;
  date: string;
}

/** Async so a missing Supabase env rejects inside Promise.all instead of throwing while the array is built. */
async function activityRows(): Promise<ActivityTotalsRow[]> {
  const { data, error } = await db()
    .from("activities")
    .select("athlete_slug, date, sport, moving_time_sec, distance_m")
    .gte("date", TRAINING_START_DATE);
  if (error) throw error;
  return (data ?? []) as ActivityTotalsRow[];
}

export async function getOverview() {
  const today = todayForAthletes();
  const window = trainingWindow(today);
  const [athletes, rows] = await Promise.all([listAthletes(), activityRows()]);

  const totals = Object.fromEntries(
    ATHLETE_SLUGS.map((slug) => {
      const mine = rows.filter((r) => r.athlete_slug === slug);
      const last = mine.reduce<string | null>((acc, r) => (acc === null || r.date > acc ? r.date : acc), null);
      return [slug, { activities: mine.length, last_activity_date: last, by_sport: sportTotals(mine) }];
    }),
  );

  return {
    today,
    time_zone: ATHLETE_TIME_ZONE,
    race: { name: "IRONMAN 70.3 Texas", date: window.race_day, days_to_go: window.days_to_race },
    training_window: window,
    athletes: ATHLETE_SLUGS.map((slug) => {
      const a = athletes.find((x) => x.slug === slug);
      return { slug, name: a?.name ?? slug, strava_linked: a?.stravaId != null, in_database: a !== undefined };
    }),
    totals_since_day_1: totals,
  };
}

export async function getFundraisingSummary() {
  const f = await getFundraising();
  return {
    raised_usd: f.raisedUsd,
    goal_usd: f.goalUsd,
    raised: formatUsd(f.raisedUsd),
    goal: formatUsd(f.goalUsd),
    progress_percent: Math.round(f.progress * 1000) / 10,
    donors: f.donors,
    page_url: f.pageUrl,
    live: f.live,
    note: f.live ? null : "DONORDRIVE_PARTICIPANT_ID is not set or DonorDrive did not answer, so these are placeholder numbers.",
    fetched_at: f.fetchedAt,
  };
}
