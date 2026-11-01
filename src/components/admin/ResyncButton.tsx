"use client";

import { useActionState } from "react";
import { resyncStrava } from "@/app/admin/actions";
import type { ResyncState } from "@/app/admin/types";
import { fmtStamp } from "./format";

const idle: ResyncState = { status: "idle" };

/** Calls the sync route server-side with CRON_SECRET and reports per athlete. */
export function ResyncButton() {
  const [state, action, pending] = useActionState(resyncStrava, idle);
  return (
    <form action={action} className="flex flex-wrap items-center gap-4">
      <button type="submit" disabled={pending} className="pill pill-ghost !h-9 !px-4 !text-[0.95rem] disabled:opacity-60">
        {pending ? "Syncing" : "Resync Strava"}
      </button>
      {state.status === "error" ? (
        <span role="alert" className="label !text-red">
          {state.message}
        </span>
      ) : null}
      {state.status === "done" ? (
        <span role="status" className="label">
          {state.summary.join(" · ")} · {fmtStamp(state.at)}
        </span>
      ) : null}
    </form>
  );
}
