import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/admin/auth";
import { exportPlanCsv } from "@/lib/admin/plan-import";
import { listPlanSessions } from "@/lib/admin/plan-db";

/** The plan as it is in the database right now, as the CSV the admin can edit and re-upload. */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return new Response("Unauthorized", { status: 401 });
  const rows = await listPlanSessions();
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(exportPlanCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="plan-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
