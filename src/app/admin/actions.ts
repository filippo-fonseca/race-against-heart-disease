"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { endSession, requireAdmin } from "@/lib/admin/auth";
import type { ResyncState } from "./types";

/**
 * Server Actions behind /admin. Every one re-checks the session first; the
 * proxy is only the optimistic gate.
 */

export async function logout(): Promise<void> {
  await endSession();
  redirect("/admin/login");
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

interface SyncResult {
  athlete: string;
  listed: number;
  upserted: number;
  detailed: number;
  skipped: number;
  errors: string[];
}

export async function resyncStrava(): Promise<ResyncState> {
  await requireAdmin();
  const secret = process.env.CRON_SECRET;
  if (!secret) return { status: "error", message: "CRON_SECRET is not configured on the server." };
  try {
    const origin = await requestOrigin();
    const res = await fetch(`${origin}/api/strava/sync`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    if (!res.ok) return { status: "error", message: `Sync route answered ${res.status}.` };
    const body = (await res.json()) as { results?: SyncResult[] };
    const summary = (body.results ?? []).map((r) => {
      const errs = r.errors.length ? ` · ${r.errors.length} error${r.errors.length === 1 ? "" : "s"}` : "";
      return `${r.athlete}: ${r.listed} listed, ${r.upserted} upserted, ${r.detailed} detailed${errs}`;
    });
    revalidatePath("/admin");
    return { status: "done", summary: summary.length ? summary : ["No Strava tokens yet: run npm run strava:auth."], at: new Date().toISOString() };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
