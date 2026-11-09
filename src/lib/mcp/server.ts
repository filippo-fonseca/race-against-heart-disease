import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getFundraisingSummary, getOverview } from "./overview";
import { deleteActivityTool, listActivitiesTool, logActivities, resyncStrava, updateActivityTool } from "./activity-tools";
import { addPhoto, removePhoto, updatePhoto } from "./photo-tools";
import { McpToolError } from "./validate";

/**
 * Tool registry for the MCP endpoint (src/app/api/mcp/route.ts). Each tool
 * is a thin zod schema plus a call into src/lib/mcp/*; the descriptions are
 * written for the LLM that calls them (the owner's Grok bot), so they say
 * what the tool does, when to prefer it, and what it will not do.
 * See docs/MCP.md for the human version.
 */

export const SERVER_INFO = { name: "race-against-heart-disease", version: "1.0.0" };

export const SERVER_INSTRUCTIONS = [
  "Training backend for Filippo and Emir, two athletes preparing for IRONMAN 70.3 Texas on 2027-04-04. There is no training plan: the site is a retroactive log of what was done, from day 1 (2026-11-02) to race day.",
  "Call get_overview first in every conversation: it returns today's date in America/New_York, today's day number in the training window, days to race, and totals by sport.",
  "Dates are always YYYY-MM-DD. athlete is filippo, emir or both.",
  "Strava is the single source of truth for activities: log_activities and update_activity write to the athlete's Strava and the site mirrors it. Recorded workouts arrive on their own (resync_strava forces it), so use log_activities only for sessions that were never recorded.",
  "Activities cannot be deleted through Strava's API: deletion happens in the Strava app, and the site follows automatically. Uploaded photos live only on this server.",
].join(" ");

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): ToolResult {
  let message: string;
  if (err instanceof McpToolError) {
    message = err.message;
  } else {
    // Supabase errors are plain objects with a message; never echo stacks.
    const detail = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
    console.error("[mcp] tool failed:", detail);
    message = `Internal error: ${detail}`;
  }
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Wrap a tool body so every outcome is a well-formed MCP result. */
function run<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return ok(await fn(args));
    } catch (err) {
      return fail(err);
    }
  };
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const;

/* ------------------------------------------------------------------ */
/* Shared argument schemas                                              */
/* ------------------------------------------------------------------ */

const date = (what: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
    .describe(`${what} (YYYY-MM-DD).`);

const athleteChoice = z
  .enum(["filippo", "emir", "both"])
  .describe("filippo, emir, or both. Omitted means both.");

const sport = z
  .enum(["swim", "bike", "run", "strength"])
  .describe("Sport bucket: swim, bike (indoor rides included), run, or strength (shown as LIFT on the site; covers HIIT, weights and anything that is not swim, bike or run).");

export function registerTools(server: McpServer): void {
  server.registerTool(
    "get_overview",
    {
      title: "Overview",
      description:
        "Start here. Returns today's date in America/New_York (use it to resolve words like today, yesterday, Thursday), race date and days to go, the training window (day 1 is 2026-11-02, race day 2027-04-04: today's day_number, total_days, days_to_race and a status line), both athletes and whether their Strava is linked, and per athlete the activity count, last activity date and totals since day 1 by sport bucket (swim, bike, run, strength shown as LIFT: sessions, hours, km). Takes no arguments.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    run(async () => getOverview()),
  );

  server.registerTool(
    "get_fundraising",
    {
      title: "Fundraising",
      description:
        "Live fundraising total for the Race Against Heart Disease page (IRONMAN Foundation DonorDrive): raised, goal, percent, donor count and the donate link. live=false means the numbers are placeholders. Takes no arguments.",
      inputSchema: z.object({}),
      annotations: { ...READ_ONLY, openWorldHint: true },
    },
    run(async () => getFundraisingSummary()),
  );

  /* ---------------------------------------------------------------- */
  /* Activities                                                         */
  /* ---------------------------------------------------------------- */

  server.registerTool(
    "list_activities",
    {
      title: "List completed activities",
      description:
        "What the athletes actually did between from and to (inclusive, at most 200 days), newest first, as mirrored from Strava. Each has id (the Strava activity id), athlete, sport, sport_type, name, date, start_local, moving_time_min, elapsed_time_min, distance_km, elevation_m, avg_hr, max_hr, avg_watts, effort, description, photos and strava_url. Each photo has id, position, source (strava: synced from the Strava app, read-only here; mcp: added through add_photo, editable), editable, url, caption, width and height. Use it before logging to avoid duplicates and to find ids for update_activity, delete_activity, add_photo, update_photo and remove_photo.",
      inputSchema: z.object({
        from: date("First day"),
        to: date("Last day, inclusive"),
        athlete: athleteChoice.optional(),
      }),
      annotations: READ_ONLY,
    },
    run(async (args) => listActivitiesTool(args)),
  );

  server.registerTool(
    "log_activities",
    {
      title: "Log unrecorded sessions to Strava",
      description:
        "Create completed sessions that were never recorded (a gym session without a watch, a pool swim not recorded, a class) as manual activities on the athlete's Strava; the site shows them immediately. Do not use it for anything already on Strava: check list_activities first, and if the athlete just finished a recorded workout, wait for Strava or call resync_strava. duration_min is required; pass only numbers the athlete actually said, never estimates. Strava manual activities hold name, sport type, start, duration, distance and description only (no heart rate, power or elevation). athlete both creates one activity on each athlete's Strava. Dates cannot be in the future. A same-day, same-sport activity already on file blocks the call unless allow_duplicates is true, because Strava activities can only be deleted in the Strava app. Sessions are created one by one; if Strava's rate limit is close or a call fails, it stops and lists what was not logged. Returns the new Strava ids.",
      inputSchema: z.object({
        activities: z
          .array(
            z.object({
              athlete: athleteChoice.describe("Who did it: filippo, emir, or both (one activity each)."),
              sport,
              sport_type: z.string().max(40).nullish().describe("Optional exact Strava sport type, overriding the bucket default (swim Swim, bike Ride, run Run, strength HighIntensityIntervalTraining), e.g. WeightTraining or Crossfit for strength, VirtualRide for Zwift, TrailRun."),
              date: date("Day it happened, in America/New_York"),
              start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, 24 hour.").nullish().describe("Local start time HH:MM (24 hour). Omit if unknown (sent as 12:00)."),
              name: z.string().max(120).nullish().describe('Title, e.g. "Masters swim" or "Leg day". Defaults to the sport.'),
              description: z.string().max(4000).nullish().describe("Notes in the athlete's words: the main set, how it felt. Put heart rate or power here if the athlete mentions them."),
              duration_min: z.number().positive().max(1440).describe("How long the session took, in minutes (required)."),
              distance_km: z.number().min(0).max(1000).nullish().describe("Distance in km (swims too: 2 means 2000 m). Optional; for bike sessions time matters more, so leave it out unless the athlete gave it."),
              trainer: z.boolean().nullish().describe("true for an indoor trainer (bike) or treadmill (run) session; an indoor ride stays in the bike bucket."),
              commute: z.boolean().nullish().describe("true if it was a commute."),
            }),
          )
          .min(1)
          .max(25),
        allow_duplicates: z.boolean().optional().describe("true logs even when the athlete already has a same-sport activity that day. Only after the athlete confirms it is a separate session."),
      }),
      annotations: { ...WRITE, idempotentHint: false, openWorldHint: true },
    },
    run(async (args) => logActivities(args)),
  );

  server.registerTool(
    "update_activity",
    {
      title: "Edit an activity",
      description:
        "Edit one activity on Strava, then refresh it on the site. Strava's API only lets these change: name, description, sport (or an exact sport_type), trainer, commute and hide_from_home. Date, time, duration, distance, heart rate and power cannot be edited through the API; for those, tell the athlete to edit the activity in the Strava app (the site follows automatically). Only the fields you pass change; null or an empty string clears description.",
      inputSchema: z.object({
        id: z.union([z.string(), z.number()]).describe("Activity id from list_activities."),
        fields: z
          .object({
            name: z.string().max(120).nullish(),
            description: z.string().max(4000).nullish(),
            sport: sport.nullish().describe("New sport bucket; sends that bucket's default Strava sport type. Ignored if the activity is already in that bucket."),
            sport_type: z.string().max(40).nullish().describe("Exact Strava sport type, e.g. WeightTraining, VirtualRide, TrailRun. Takes priority over sport."),
            trainer: z.boolean().nullish().describe("Indoor trainer or treadmill session."),
            commute: z.boolean().nullish(),
            hide_from_home: z.boolean().nullish().describe("true mutes it from Strava home feeds."),
          })
          .describe("Only the fields to change."),
      }),
      annotations: { ...WRITE, openWorldHint: true },
    },
    run(async (args) => updateActivityTool(args)),
  );

  server.registerTool(
    "delete_activity",
    {
      title: "How to delete an activity",
      description:
        "Does not delete anything. Strava's API cannot delete activities, so this returns the activity, its Strava link and step-by-step instructions to delete it in the Strava app or website. Relay those to the athlete. Once they delete it on Strava, the site removes it (and any photos uploaded to it) automatically.",
      inputSchema: z.object({
        id: z.union([z.string(), z.number()]).describe("Activity id from list_activities."),
      }),
      annotations: READ_ONLY,
    },
    run(async (args) => deleteActivityTool(args)),
  );

  server.registerTool(
    "resync_strava",
    {
      title: "Pull new activities from Strava",
      description:
        "Fetch activities from Strava now instead of waiting for the webhook or the daily cron. Use it when the athlete says a Strava workout is missing. budget caps how many activities get the full detail and photo fetch per athlete (default 10, max 25); the rest are stored as summaries and detailed on the next run. Returns per-athlete counts and errors.",
      inputSchema: z.object({
        athlete: athleteChoice.optional(),
        since: date("Only activities on or after this day; default 2026-11-02").optional(),
        budget: z.number().int().min(0).max(25).optional().describe("Detail fetches per athlete, default 10."),
      }),
      annotations: { ...WRITE, openWorldHint: true },
    },
    run(async (args) => resyncStrava(args)),
  );

  /* ---------------------------------------------------------------- */
  /* Photos                                                             */
  /* ---------------------------------------------------------------- */

  server.registerTool(
    "add_photo",
    {
      title: "Add a photo to an activity",
      description:
        "Add a session photo to a Strava activity. It shows on the website next to the activity, together with the photos the athlete added in the Strava app; it does NOT appear inside the Strava app (Strava's API cannot upload photos). Give the image as image_url (a URL this server can download, such as a Telegram file URL from getFile) or as image_base64 (raw base64 or a data: URL). JPEG, PNG, WebP or HEIC, at most 15 MB; prefer JPEG. Target the activity with activity_id (the Strava id from list_activities), or with date (optionally plus sport) to use the only matching activity that day. If zero or several activities match, nothing is stored: the result has attached false, a reason, and the candidates; ask which one (or log/resync the session first) and call again with activity_id.",
      inputSchema: z.object({
        athlete: z.enum(["filippo", "emir"]).describe("Whose activity: filippo or emir."),
        activity_id: z.union([z.string(), z.number()]).nullish().describe("Strava activity id from list_activities. Takes priority over date."),
        date: date("Day of the activity, used when activity_id is omitted").nullish(),
        sport: sport.nullish().describe("With date: only consider activities in this bucket (swim, bike, run, strength)."),
        image_url: z.string().url().max(2048).nullish().describe("Public http(s) URL of the image. Not stored; only the image is."),
        image_base64: z
          .string()
          .max(6_000_000)
          .nullish()
          .describe("The image bytes as base64 (or a data:image/...;base64, URL). Only for images under about 3 MB: the host caps request bodies at 4.5 MB, so send bigger files as image_url."),
        mime_type: z.string().max(40).nullish().describe("Optional declared type, e.g. image/jpeg. The real type is detected from the bytes."),
        caption: z.string().max(300).nullish().describe("Optional caption shown as the photo's alt text."),
      }),
      annotations: { ...WRITE, idempotentHint: false, openWorldHint: true },
    },
    run(async (args) => addPhoto(args)),
  );

  server.registerTool(
    "update_photo",
    {
      title: "Edit, replace or reorder added photos",
      description:
        "Change photos added through this server (source mcp, ids starting with upload-; see the photos of an activity in list_activities). Any combination of: caption (null or empty clears it), a new image for photo_id (image_url or image_base64; the photo gets a new id in the same position and the old file is deleted), and order (every added photo id of the activity, in the new order). Strava photos (source strava) are read-only: they always come first in Strava's order, and only the Strava app can change or remove them; the site follows automatically.",
      inputSchema: z.object({
        activity_id: z.union([z.string(), z.number()]).describe("Strava activity id from list_activities."),
        photo_id: z.string().min(1).nullish().describe("The added photo to change; required for caption or a new image."),
        caption: z.string().max(300).nullish().describe("New caption; null or empty string clears it. Omit to keep it."),
        image_url: z.string().url().max(2048).nullish().describe("Replacement image URL (see add_photo)."),
        image_base64: z.string().max(6_000_000).nullish().describe("Replacement image as base64 (see add_photo; under about 3 MB)."),
        mime_type: z.string().max(40).nullish(),
        order: z.array(z.string().min(1)).max(50).nullish().describe("Every added photo id of this activity, in the order to show them (after the Strava photos)."),
      }),
      annotations: { ...WRITE, idempotentHint: false, openWorldHint: true },
    },
    run(async (args) => updatePhoto(args)),
  );

  server.registerTool(
    "remove_photo",
    {
      title: "Remove an added photo",
      description:
        "Remove one photo that was added through this server (source mcp) from an activity and delete its file. Strava photos (source strava) are read-only and are refused: the athlete removes those in the Strava app and the site follows. Confirm with the user first.",
      inputSchema: z.object({
        activity_id: z.union([z.string(), z.number()]).describe("Strava activity id from list_activities."),
        photo_id: z.string().min(1).describe("Photo id (upload-...) from that activity's photos list."),
      }),
      annotations: DESTRUCTIVE,
    },
    run(async (args) => removePhoto(args)),
  );
}
