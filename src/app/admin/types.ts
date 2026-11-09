/** Shared, serialisable state for the admin Server Actions. */

export type ResyncState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; summary: string[]; at: string };
