import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string equality over SHA-256 digests, so neither the content
 * nor the length of a secret leaks through timing. Shared by the admin login
 * and the MCP bearer check. Pure Node, no Next imports, so tests can load it.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}
