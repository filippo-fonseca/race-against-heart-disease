import type { PlanDiff } from "@/lib/admin/plan-import";

/** Shared, serialisable state for the plan upload Server Actions. */

export type Scope = "csv-range" | "all";

export interface UploadOptions {
  scope: Scope;
  deleteRemoved: boolean;
}

export type CheckState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "invalid"; csv: string; errors: { line: number; message: string }[]; rows: number; options: UploadOptions }
  | { status: "ready"; csv: string; diff: PlanDiff; options: UploadOptions };

export type ApplyState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; result: { added: number; changed: number; removed: number }; options: UploadOptions };

export type ResyncState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; summary: string[]; at: string };
