import "server-only";
import { listActivities } from "@/lib/training/queries";
import type { Activity } from "@/lib/training/types";

/**
 * Read side of the admin dashboard. Nothing here is cached: the admin always
 * sees the database as it is right now. Failures come back as messages so a
 * missing table or env renders a note instead of a 500.
 */
export async function recentActivities(limit = 20): Promise<{ rows: Activity[]; error: string | null }> {
  try {
    return { rows: await listActivities({ limit }), error: null };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}
