import { safeEqual } from "../safe-equal";

/**
 * Bearer check for /api/mcp. The token lives in MCP_TOKEN and is compared in
 * constant time. When MCP_TOKEN is unset the endpoint is closed (503), never
 * open. Pure (the env value is passed in), so tests can exercise it.
 */

export type McpAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; message: string };

/**
 * The credential in an Authorization header. Accepts `Bearer <token>` (any
 * case) and, for clients that send the raw token as the header value, the
 * bare token. Returns null when the header is missing or empty.
 */
export function extractBearer(header: string | null | undefined): string | null {
  if (typeof header !== "string") return null;
  const value = header.trim();
  if (value.length === 0) return null;
  const match = /^bearer\s+(.+)$/i.exec(value);
  const token = (match ? match[1] : value).trim();
  return token.length > 0 ? token : null;
}

export function checkMcpAuth(header: string | null | undefined, expected: string | undefined): McpAuthResult {
  if (!expected || expected.trim().length === 0) {
    return { ok: false, status: 503, message: "MCP endpoint is not configured (MCP_TOKEN is unset)." };
  }
  const token = extractBearer(header);
  if (token === null || !safeEqual(token, expected)) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  return { ok: true };
}
