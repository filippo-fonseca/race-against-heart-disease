import "./strava-env";
import { parseArgs } from "node:util";
import { parseAthlete, requireEnv } from "./strava-env";
import { loadAthleteRow } from "../src/lib/training/db";
import { syncAthlete, TRAINING_START } from "../src/lib/training/sync";

/**
 * Pull activities from Strava into Supabase.
 *
 *   npm run strava:backfill                    # Filippo, since training start
 *   npm run strava:backfill -- --since 2026-11-02
 *
 * `--budget N` caps how many activities get the detail + photos calls in this
 * run (default 80, well inside 100 requests / 15 min). Rows left as summaries
 * are enriched by the next run or by the cron.
 */

const { values } = parseArgs({
  options: {
    athlete: { type: "string" },
    since: { type: "string" },
    budget: { type: "string" },
  },
});
requireEnv("STRAVA_CLIENT_ID");
requireEnv("STRAVA_CLIENT_SECRET");
requireEnv("NEXT_PUBLIC_SUPABASE_URL");
requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const since = values.since ? new Date(`${values.since}T00:00:00Z`) : TRAINING_START;
if (Number.isNaN(since.getTime())) {
  console.error("--since must be YYYY-MM-DD");
  process.exit(1);
}
const budget = values.budget ? Number(values.budget) : 80;

async function main() {
  const slug = parseAthlete(values.athlete);
  const athlete = await loadAthleteRow(slug);
  if (!athlete || !athlete.refresh_token) {
    console.error(`${slug} has not authorized Strava; run npm run strava:auth first.`);
    process.exit(1);
  }

  console.log(`Syncing ${athlete.slug} since ${since.toISOString().slice(0, 10)}...`);
  const stats = await syncAthlete(athlete, { since, budget });
  console.log(
    `  listed ${stats.listed}, upserted ${stats.upserted}, detailed ${stats.detailed}, skipped ${stats.skipped}` +
      (stats.budgetExhausted ? " (budget exhausted, run again later)" : ""),
  );
  for (const e of stats.errors) console.warn(`  ${e}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
