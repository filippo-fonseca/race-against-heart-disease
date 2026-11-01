import { after, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { loadAthleteRowByStravaId } from "@/lib/training/db";
import { TRAINING_CACHE_TAG } from "@/lib/training/queries";
import { deleteActivity, syncActivity } from "@/lib/training/sync";

/**
 * Strava push subscription endpoint.
 * GET  answers the one-time hub.challenge handshake.
 * POST acknowledges events immediately (Strava expects a 200 within two
 *      seconds) and does the activity fetch after the response is sent.
 */

export const maxDuration = 30;

interface StravaEvent {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates?: Record<string, string>;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const challenge = params.get("hub.challenge");
  const token = params.get("hub.verify_token");
  const expected = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;

  if (mode !== "subscribe" || !challenge || !expected || token !== expected) {
    return new Response("Forbidden", { status: 403 });
  }
  return Response.json({ "hub.challenge": challenge });
}

export async function POST(request: NextRequest) {
  let event: StravaEvent;
  try {
    event = (await request.json()) as StravaEvent;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (event.object_type === "activity" && typeof event.object_id === "number") {
    after(() => handleActivityEvent(event));
  }
  // Athlete events (deauthorization) need nothing stored; acknowledge them.
  return new Response("ok", { status: 200 });
}

async function handleActivityEvent(event: StravaEvent) {
  try {
    const athlete = await loadAthleteRowByStravaId(event.owner_id);
    if (!athlete) {
      console.warn(`strava webhook: unknown owner ${event.owner_id}, ignoring`);
      return;
    }
    if (event.aspect_type === "delete") {
      await deleteActivity(event.object_id);
    } else {
      await syncActivity(athlete, event.object_id);
    }
    revalidateTag(TRAINING_CACHE_TAG, "max");
  } catch (err) {
    // Never rethrow: the cron sync will reconcile anything missed here.
    console.error(`strava webhook: ${event.aspect_type} ${event.object_id} failed`, err);
  }
}
