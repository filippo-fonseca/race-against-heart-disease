import "./strava-env";
import planJson from "../data/plan.json";
import { listPlanSessions, upsertPlanSessions } from "../src/lib/admin/plan-db";
import { validatePlan } from "../src/lib/training/plan";

/**
 * Seed `training.plan_sessions` from data/plan.json.
 *
 *   npm run plan:seed
 *
 * Idempotent: rows are upserted by id, so re-running after a plan:gen only
 * rewrites what changed and never deletes. Rows the admin page added later
 * (ids not in the JSON) are left alone. Needs NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local and the 0002 migration applied.
 * The running site picks the change up on its next cache revalidation
 * (hourly) or after any admin upload or Strava sync, which revalidate the tag.
 */
async function main(): Promise<void> {
  const plan = validatePlan(planJson);
  const before = await listPlanSessions();
  const existing = new Set(before.map((s) => s.id));
  const written = await upsertPlanSessions(plan);
  const after = await listPlanSessions();

  const inserted = plan.filter((s) => !existing.has(s.id)).length;
  console.log(`plan.json: ${plan.length} sessions (${plan[0].date} to ${plan[plan.length - 1].date})`);
  console.log(`training.plan_sessions: ${before.length} rows before, ${after.length} after`);
  console.log(`upserted ${written}: ${inserted} inserted, ${written - inserted} updated in place`);
  const orphans = after.length - plan.length;
  if (orphans > 0) console.log(`${orphans} row(s) in the DB are not in plan.json and were left untouched`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
