import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getFundraisingSummary, getOverview } from "./overview";
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
}
