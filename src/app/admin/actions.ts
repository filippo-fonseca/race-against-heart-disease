"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { endSession, requireAdmin } from "@/lib/admin/auth";
import { applyPlanDiff, diffPlan, parsePlanCsv } from "@/lib/admin/plan-import";
import { listPlanSessions } from "@/lib/admin/plan-db";
import type { ApplyState, CheckState, ResyncState, Scope, UploadOptions } from "./types";

/**
 * Server Actions behind /admin. Every one re-checks the session first; the
 * proxy is only the optimistic gate. The CSV is parsed and diffed on the
 * server both at Check and again at Apply, so nothing from the preview is
 * trusted.
 */

const MAX_CSV_BYTES = 1_000_000;

function readOptions(formData: FormData): UploadOptions {
  const scope: Scope = formData.get("scope") === "all" ? "all" : "csv-range";
  return { scope, deleteRemoved: formData.get("deleteRemoved") === "on" };
}

/** The pasted text wins over an empty file input; a chosen file wins over both. */
async function readCsv(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_CSV_BYTES) throw new Error("That file is larger than 1 MB.");
    return file.text();
  }
  const pasted = formData.get("csv");
  const text = typeof pasted === "string" ? pasted : "";
  if (text.length > MAX_CSV_BYTES) throw new Error("That paste is larger than 1 MB.");
  return text;
}

async function parseAndDiff(csv: string, options: UploadOptions) {
  const parsed = parsePlanCsv(csv);
  if (parsed.errors.length > 0) return { parsed, diff: null };
  const existing = await listPlanSessions();
  return { parsed, diff: diffPlan(parsed.rows, existing, { scope: options.scope }) };
}

export async function checkPlan(_prev: CheckState, formData: FormData): Promise<CheckState> {
  await requireAdmin();
  const options = readOptions(formData);
  try {
    const csv = (await readCsv(formData)).replace(/^﻿/, "");
    if (csv.trim().length === 0) return { status: "error", message: "Choose a file or paste the CSV first." };
    const { parsed, diff } = await parseAndDiff(csv, options);
    if (!diff) return { status: "invalid", csv, errors: parsed.errors, rows: parsed.rows.length, options };
    return { status: "ready", csv, diff, options };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

export async function applyPlan(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  await requireAdmin();
  const options = readOptions(formData);
  const csv = typeof formData.get("csv") === "string" ? (formData.get("csv") as string) : "";
  if (csv.trim().length === 0) return { status: "error", message: "Nothing to apply. Run Check again." };
  try {
    const { parsed, diff } = await parseAndDiff(csv, options);
    if (!diff) {
      return { status: "error", message: `The CSV no longer parses (${parsed.errors.length} error${parsed.errors.length === 1 ? "" : "s"}). Run Check again.` };
    }
    const result = await applyPlanDiff(diff, { deleteRemoved: options.deleteRemoved });
    revalidatePath("/admin");
    return { status: "done", result, options };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

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
    return { status: "done", summary: summary.length ? summary : ["No athletes with Strava tokens."], at: new Date().toISOString() };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
