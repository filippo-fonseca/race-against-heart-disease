import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getFundraisingSummary, getOverview } from "./overview";
import { deletePlan, listPlan, replacePlanRange, upsertPlan } from "./plan-tools";
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
  "Training backend for Filippo and Emir, two athletes preparing for IRONMAN 70.3 Texas on 2027-04-04.",
  "Call get_overview first in every conversation: it returns today's date in America/New_York, the current program week and phase, and what is planned today.",
  "Dates are always YYYY-MM-DD. athlete is filippo, emir or both. Rest days are dates with no plan rows.",
  "For multi-day plan edits, call replace_plan_range with dry_run true, show the diff, and only then call it again with dry_run false.",
  "Use log_activities only for sessions that are not on Strava; Strava sessions arrive on their own (resync_strava forces it).",
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

const sport = z.enum(["swim", "bike", "run", "strength", "other"]).describe("swim, bike, run, strength, or other.");

const planSession = z.object({
  id: z
    .string()
    .max(200)
    .nullish()
    .describe("Existing session id, only when updating or moving that exact row (ids come from list_plan). Omit for new sessions: the id is derived as <date>-<sport>-<slug of title>."),
  date: date("Day of the session; must fall inside the program, 2026-11-02 to 2027-04-04"),
  sport,
  title: z.string().min(1).max(120).describe('Short name, a few words, e.g. "Easy run" or "Threshold intervals".'),
  detail: z.string().max(4000).nullish().describe('Full prescription the athlete reads, e.g. "15 min warm up, 4 x 8 min @ threshold with 3 min easy, 10 min cool down".'),
  target_min: z.number().int().min(0).max(1440).nullish().describe("Planned duration in whole minutes."),
  target_km: z.number().min(0).max(500).nullish().describe("Planned distance in km (swims too: 1.5 means 1500 m)."),
  athlete: athleteChoice.nullish().describe("Who the session is for: filippo, emir, or both (default both, meaning the shared plan)."),
  phase: z.string().max(40).nullish().describe("Leave empty: derived from the week (Base 1, Base 2, Build 1, Build 2, Peak, Taper)."),
  week: z.number().int().min(1).max(22).nullish().describe("Leave empty: derived from the date. If given it must match."),
});

export function registerTools(server: McpServer): void {
  server.registerTool(
    "get_overview",
    {
      title: "Overview",
      description:
        "Start here. Returns today's date in America/New_York (use it to resolve words like today, yesterday, Thursday), race date and days to go, both athletes and whether their Strava is linked, plan coverage (first and last planned date, session count), the current program week and phase, each athlete's planned sessions for today, and activity counts (Strava vs manual, last activity date). Takes no arguments.",
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
  /* Plan                                                               */
  /* ---------------------------------------------------------------- */

  server.registerTool(
    "list_plan",
    {
      title: "List planned sessions",
      description:
        "Planned sessions between from and to (inclusive, at most 200 days), sorted by date. With athlete set, returns only sessions that apply to that athlete (shared sessions included). Each session has id, date, sport, title, detail, target_min, target_km, athlete (filippo, emir or both), phase, week. rest_days lists dates with nothing planned. Call this before editing so you know the ids and what already exists.",
      inputSchema: z.object({
        from: date("First day"),
        to: date("Last day, inclusive"),
        athlete: athleteChoice.optional(),
      }),
      annotations: READ_ONLY,
    },
    run(async (args) => listPlan(args)),
  );

  server.registerTool(
    "upsert_plan_sessions",
    {
      title: "Create or update planned sessions",
      description:
        "Bulk create or update planned sessions without deleting anything. A session with id updates that row (and can move it to another date: that is how you move a session). Without id it updates the row with the same date, sport, title and athlete, or creates a new one. week and phase are derived from the date. Use this to add a session or tweak a few; use replace_plan_range when the caller describes the complete plan for some days. Returns created, updated and unchanged counts and ids.",
      inputSchema: z.object({
        sessions: z.array(planSession).min(1).max(200).describe("Sessions to create or update."),
      }),
      annotations: WRITE,
    },
    run(async (args) => upsertPlan(args)),
  );

  server.registerTool(
    "replace_plan_range",
    {
      title: "Replace the plan for a date range",
      description:
        'The main tool for "here is my training for today / this week / these dates". Makes the plan for [from, to] (inclusive, at most 62 days) exactly the given sessions: matching sessions are kept or updated in place, new ones created, and sessions in the range that are not in the list are deleted. An empty sessions list clears the range (all rest days). With athlete filippo or emir, only that athlete\'s plan changes: sessions are pinned to them, and a shared session they drop or change stays for the other athlete. Always call with dry_run true first, show the user the diff (creates, updates, deletes, narrows), and call again with dry_run false only after they confirm.',
      inputSchema: z.object({
        from: date("First day to replace"),
        to: date("Last day to replace, inclusive"),
        athlete: athleteChoice.optional(),
        sessions: z.array(planSession).max(300).describe("The complete set of sessions for the range. Every date must be inside [from, to]. With athlete set, omit athlete on each session."),
        dry_run: z.boolean().optional().describe("true returns the diff without writing. Default false."),
      }),
      annotations: DESTRUCTIVE,
    },
    run(async (args) => replacePlanRange(args)),
  );

  server.registerTool(
    "delete_plan_sessions",
    {
      title: "Delete planned sessions",
      description:
        "Delete planned sessions by ids, or every session in a date range (from and to, at most 62 days), or the ids that fall in the range when both are given. An empty filter is refused. With athlete filippo or emir, only that athlete's sessions go: shared sessions are kept for the other athlete. Confirm with the user before calling; use dry_run true to preview.",
      inputSchema: z.object({
        ids: z.array(z.string().min(1)).max(300).optional().describe("Session ids from list_plan."),
        from: date("First day of the range").optional(),
        to: date("Last day of the range, inclusive").optional(),
        athlete: athleteChoice.optional(),
        dry_run: z.boolean().optional().describe("true previews without deleting. Default false."),
      }),
      annotations: DESTRUCTIVE,
    },
    run(async (args) => deletePlan(args)),
  );
}
