import { fmtClock, fmtHM, fmtKm } from "@/components/training/format";
import { SportPill } from "@/components/training/SportPill";
import type { Activity } from "@/lib/training/types";
import { ResyncButton } from "./ResyncButton";

const cell = "num whitespace-nowrap px-3 py-2 text-[0.8rem] first:pl-0 last:pr-0";
const head = "label whitespace-nowrap px-3 py-2 text-left font-normal first:pl-0 last:pr-0";

/** The last twenty activities, read-only, plus the resync control. */
export function Activities({ rows, error }: { rows: Activity[]; error: string | null }) {
  return (
    <section aria-labelledby="activities-h" className="mt-14">
      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-ink pt-2">
        <h2 id="activities-h" className="label !text-ink">
          Recent activities · last {rows.length}
        </h2>
        <ResyncButton />
      </div>

      {error ? (
        <p role="alert" className="label mt-4 !text-red">
          Activities unavailable: {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="label mt-4">Nothing logged yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-ink">
                {["Date", "Start", "Athlete", "Sport", "Name", "Time", "Km", "HR", "Detail"].map((h) => (
                  <th key={h} scope="col" className={head}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-rule align-top">
                  <td className={cell}>{a.date}</td>
                  <td className={`${cell} text-ink-soft`}>{fmtClock(a.startLocal)}</td>
                  <td className={cell}>{a.athlete}</td>
                  <td className={cell}>
                    <SportPill sport={a.sport} />
                  </td>
                  <td className={`${cell} !whitespace-normal min-w-[12rem] text-ink`}>{a.name}</td>
                  <td className={cell}>{fmtHM(a.movingTimeSec)}</td>
                  <td className={cell}>{a.distanceM > 0 ? fmtKm(a.distanceM, a.sport) : ""}</td>
                  <td className={cell}>{a.avgHr ?? ""}</td>
                  <td className={`${cell} ${a.detailed ? "text-ink-soft" : "text-red"}`}>{a.detailed ? "full" : "summary"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
