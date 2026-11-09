import { createMcpHandler } from "mcp-handler";
import { checkMcpAuth } from "@/lib/mcp/auth";
import { registerTools, SERVER_INFO, SERVER_INSTRUCTIONS } from "@/lib/mcp/server";

/**
 * Remote MCP server for the owner's Grok bot (docs/MCP.md). Streamable HTTP,
 * stateless: every POST is a self-contained JSON-RPC exchange, so it runs on
 * serverless without sessions or Redis.
 *
 * Auth: `Authorization: Bearer <MCP_TOKEN>`, compared in constant time. With
 * MCP_TOKEN unset the endpoint answers 503 and serves nothing. The admin
 * proxy (src/proxy.ts) only matches /admin and /api/admin, so it never sees
 * this route; the bearer check here is the only gate.
 */

// Same ceiling as the Strava cron route; resync_strava caps its detail budget to fit.
export const maxDuration = 60;

const mcp = createMcpHandler(registerTools, {
  serverInfo: SERVER_INFO,
  instructions: SERVER_INSTRUCTIONS,
});

async function handler(request: Request): Promise<Response> {
  const auth = checkMcpAuth(request.headers.get("authorization"), process.env.MCP_TOKEN);
  if (!auth.ok) {
    const headers: Record<string, string> = { "cache-control": "no-store" };
    if (auth.status === 401) headers["www-authenticate"] = 'Bearer realm="mcp"';
    return Response.json({ error: auth.message }, { status: auth.status, headers });
  }
  return mcp(request);
}

export { handler as GET, handler as POST, handler as DELETE };
