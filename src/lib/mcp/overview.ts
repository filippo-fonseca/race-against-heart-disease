import { formatUsd, getFundraising } from "../fundraising";
import { listPlanSessions, planStats } from "../admin/plan-db";
import { db } from "../training/db";
import { appliesTo, daysToRace, PLAN_START, planWindow, RACE_DATE, weekOf } from "../training/plan";
import { listAthletes } from "../training/queries";
import type { AthleteSlug } from "../training/types";
import { isManualId } from "./activity-logic";
import { compactPlanSession } from "./plan-logic";
import { ATHLETE_SLUGS, ATHLETE_TIME_ZONE, todayForAthletes } from "./validate";

/**
 * Read-only tools: get_overview and get_fundraising. Server only (Supabase).
 */

interface ActivityCountRow {
  id: number;
  athlete_slug: AthleteSlug;
  date: string;
}

/** Async so a missing Supabase env rejects inside Promise.all instead of throwing while the array is built. */
async function activityCountRows(): Promise<ActivityCountRow[]> {
  const { data, error } = await db().from("activities").select("id, athlete_slug, date");
  if (error) throw error;
  return (data ?? []) as ActivityCountRow[];
}

export async function getOverview() {
  const today = todayForAthletes();
  const week = weekOf(today);
  const window = planWindow();

  const [athletes, stats, todayPlan, rows] = await Promise.all([
    listAthletes(),
    planStats(),
    listPlanSessions({ from: today, to: today }),
    activityCountRows(),
  ]);

  const activities = Object.fromEntries(
    ATHLETE_SLUGS.map((slug) => {
      const mine = rows.filter((r) => r.athlete_slug === slug);
      const manual = mine.filter((r) => isManualId(r.id)).length;
      const last = mine.reduce<string | null>((acc, r) => (acc === null || r.date > acc ? r.date : acc), null);
      return [slug, { total: mine.length, strava: mine.length - manual, manual, last_date: last }];
    }),
  );

  let status: string;
  if (today < PLAN_START) status = `Before the program: week 1 starts ${PLAN_START}.`;
  else if (today > RACE_DATE) status = "After race day.";
  else status = `Week ${week.week} of ${window.weeks}, ${week.phase ?? "no phase"}.`;

  return {
    today,
    time_zone: ATHLETE_TIME_ZONE,
    race: { name: "IRONMAN 70.3 Texas", date: RACE_DATE, days_to_go: daysToRace(today) },
    program: {
      start: window.from,
      end: window.to,
      weeks: window.weeks,
      status,
      current_week: today >= PLAN_START && today <= window.to ? week.week : null,
      current_phase: week.phase,
      week_start: week.start,
      week_end: week.end,
    },
    athletes: ATHLETE_SLUGS.map((slug) => {
      const a = athletes.find((x) => x.slug === slug);
      return { slug, name: a?.name ?? slug, strava_linked: a?.stravaId != null, in_database: a !== undefined };
    }),
    plan_coverage: { first_date: stats.from, last_date: stats.to, sessions: stats.count, updated_at: stats.updatedAt },
    today_plan: Object.fromEntries(
      ATHLETE_SLUGS.map((slug) => [slug, todayPlan.filter((s) => appliesTo(s, slug)).map(compactPlanSession)]),
    ),
    activities,
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
