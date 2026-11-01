import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/admin/auth";

/** docs/plan-template.csv, served as a download. */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return new Response("Unauthorized", { status: 401 });
  let text: string;
  try {
    text = await readFile(path.join(process.cwd(), "docs", "plan-template.csv"), "utf8");
  } catch {
    return new Response("Template not found", { status: 404 });
  }
  return new Response(text, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plan-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
