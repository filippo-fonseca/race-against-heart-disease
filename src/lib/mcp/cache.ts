import { revalidateTag } from "next/cache";
import { TRAINING_CACHE_TAG } from "../training/queries";

/**
 * Every MCP write calls this. `{ expire: 0 }` (rather than the "max" profile
 * the cron uses) means the next visit to /training or the homepage blocks on
 * fresh data instead of being served the stale entry once: the bot tells the
 * athlete "done", so the page they open next must already show it.
 */
export function invalidateTraining(): void {
  revalidateTag(TRAINING_CACHE_TAG, { expire: 0 });
}
