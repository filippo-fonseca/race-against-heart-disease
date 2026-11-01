import "./strava-env";
import { parseArgs } from "node:util";
import { parseAthlete, requireEnv } from "./strava-env";
import { loadAthleteRow, loadAthleteRows, type AthleteRow } from "../src/lib/training/db";
import { syncAthlete, TRAINING_START } from "../src/lib/training/sync";

/**
 * Pull activities from Strava into Supabase.
 *
 *   npm run strava:backfill -- --athlete filippo --since 2026-11-02
 *   npm run strava:backfill                 # both athletes, since training start
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
  let athletes: AthleteRow[];
  if (values.athlete) {
    const row = await loadAthleteRow(parseAthlete(values.athlete));
    if (!row) {
      console.error(`No athlete row for ${values.athlete}; run strava:auth first.`);
      process.exit(1);
    }
    athletes = [row];
  } else {
    athletes = (await loadAthleteRows()).filter((a) => a.refresh_token);
    if (athletes.length === 0) {
      console.error("No authorized athletes; run strava:auth first.");
      process.exit(1);
    }
  }

  for (const athlete of athletes) {
    console.log(`Syncing ${athlete.slug} since ${since.toISOString().slice(0, 10)}...`);
    const stats = await syncAthlete(athlete, { since, budget });
    console.log(
      `  listed ${stats.listed}, upserted ${stats.upserted}, detailed ${stats.detailed}, skipped ${stats.skipped}` +
        (stats.budgetExhausted ? " (budget exhausted, run again later)" : ""),
    );
    for (const e of stats.errors) console.warn(`  ${e}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
