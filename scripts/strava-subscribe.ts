import "./strava-env";
import { parseArgs } from "node:util";
import { requireEnv } from "./strava-env";
import {
  createSubscription,
  deleteSubscription,
  listSubscriptions,
} from "../src/lib/training/strava";

/**
 * Manage the Strava webhook subscription (one per app).
 *
 *   npm run strava:subscribe -- --callback https://raceagainstheartdisease.com/api/strava/webhook
 *   npm run strava:subscribe -- --list
 *   npm run strava:subscribe -- --delete <id>
 *
 * The callback must be deployed and reachable: Strava calls it with
 * hub.challenge during this command, and the route checks
 * STRAVA_WEBHOOK_VERIFY_TOKEN, which must match on Vercel and in .env.local.
 */

const { values } = parseArgs({
  options: {
    callback: { type: "string" },
    list: { type: "boolean" },
    delete: { type: "string" },
  },
});
requireEnv("STRAVA_CLIENT_ID");
requireEnv("STRAVA_CLIENT_SECRET");

async function main() {
  if (values.delete) {
    await deleteSubscription(Number(values.delete));
    console.log(`Deleted subscription ${values.delete}.`);
    return;
  }

  const existing = await listSubscriptions();
  if (values.list || !values.callback) {
    if (existing.length === 0) console.log("No subscriptions.");
    for (const s of existing) console.log(`${s.id}  ${s.callback_url}  (created ${s.created_at})`);
    if (!values.list) console.log("\nPass --callback <url> to create one.");
    return;
  }

  const match = existing.find((s) => s.callback_url === values.callback);
  if (match) {
    console.log(`Already subscribed (id ${match.id}) to ${match.callback_url}.`);
    return;
  }
  if (existing.length > 0) {
    console.error(
      `An app can only have one subscription. Delete ${existing[0].id} first: --delete ${existing[0].id}`,
    );
    process.exit(1);
  }

  const verifyToken = requireEnv("STRAVA_WEBHOOK_VERIFY_TOKEN");
  const created = await createSubscription(values.callback, verifyToken);
  console.log(`Subscribed (id ${created.id}) to ${values.callback}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
