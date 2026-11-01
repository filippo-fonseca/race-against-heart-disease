import type { PlanDiff } from "@/lib/admin/plan-import";
import type { PlanSession } from "@/lib/training/types";
import { FIELD_LABELS, fieldValue } from "./format";

/**
 * Pure rendering of a PlanDiff: the summary strip, the changed table with
 * before and after per field, then the added and removed lists. Tables sit
 * in a horizontal scroller so phones never overflow.
 */

const cell = "num whitespace-nowrap px-3 py-2 text-[0.8rem] first:pl-0 last:pr-0";
const head = "label whitespace-nowrap px-3 py-2 text-left font-normal first:pl-0 last:pr-0";

function Count({ n, label, accent = false }: { n: number; label: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="label mt-2 whitespace-nowrap">{label}</dt>
      <dd className={`num text-[1.85rem] leading-none tracking-tight sm:text-[2.2rem] ${accent && n > 0 ? "text-red" : "text-ink"}`}>{n}</dd>
    </div>
  );
}

function SessionRows({ rows, tone }: { rows: PlanSession[]; tone: "ink" | "soft" }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse ${tone === "soft" ? "text-ink-soft" : "text-ink"}`}>
        <thead>
          <tr className="border-b border-ink">
            {["Date", "Sport", "Title", "Min", "Km", "Athletes", "Week", "Id"].map((h) => (
              <th key={h} scope="col" className={head}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-rule align-top">
              <td className={cell}>{s.date}</td>
              <td className={cell}>{s.sport}</td>
              <td className={`${cell} !whitespace-normal min-w-[12rem]`}>
                {s.title}
                {s.detail ? <div className="font-serif text-[0.95rem] italic leading-snug text-ink-soft">{s.detail}</div> : null}
              </td>
              <td className={cell}>{s.targetMin ?? ""}</td>
              <td className={cell}>{s.targetKm ?? ""}</td>
              <td className={cell}>{fieldValue(s, "athletes")}</td>
              <td className={cell}>{s.week}</td>
              <td className={`${cell} text-ink-faint`}>{s.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DiffPreview({ diff, deleteRemoved }: { diff: PlanDiff; deleteRemoved: boolean }) {
  const total = diff.added.length + diff.changed.length + (deleteRemoved ? diff.removed.length : 0);
  return (
    <div className="mt-8 space-y-10">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-ink py-6 sm:grid-cols-4">
        <Count n={diff.added.length} label="Added" accent />
        <Count n={diff.changed.length} label="Changed" accent />
        <Count n={diff.unchanged} label="Unchanged" />
        <Count n={diff.removed.length} label={deleteRemoved ? "Removed" : "Removed (kept)"} accent={deleteRemoved} />
      </dl>

      <p className="label">
        CSV covers {diff.range.from} to {diff.range.to}
        {total === 0 ? " · nothing to write" : ` · ${total} write${total === 1 ? "" : "s"} on apply`}
      </p>

      {diff.changed.length > 0 ? (
        <section aria-labelledby="changed-h">
          <h3 id="changed-h" className="label border-t border-ink pt-2 !text-ink">
            Changed · {diff.changed.length}
          </h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-ink">
                  <th scope="col" className={head}>Session</th>
                  <th scope="col" className={head}>Field</th>
                  <th scope="col" className={head}>Before</th>
                  <th scope="col" className={head}>After</th>
                </tr>
              </thead>
              <tbody>
                {diff.changed.flatMap((c) =>
                  c.fields.map((f, i) => (
                    <tr key={`${c.after.id}:${f}`} className={`align-top ${i === c.fields.length - 1 ? "border-b border-rule" : ""}`}>
                      <td className={`${cell} text-ink`}>
                        {i === 0 ? (
                          <>
                            {c.before.date} · {c.before.sport}
                            <div className="text-ink-soft">{c.before.title}</div>
                          </>
                        ) : null}
                      </td>
                      <td className={`${cell} text-ink-soft`}>{FIELD_LABELS[f] ?? f}</td>
                      <td className={`${cell} !whitespace-normal min-w-[10rem] text-ink-soft line-through decoration-rule`}>{fieldValue(c.before, f)}</td>
                      <td className={`${cell} !whitespace-normal min-w-[10rem] text-red`}>{fieldValue(c.after, f)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {diff.added.length > 0 ? (
        <section aria-labelledby="added-h">
          <h3 id="added-h" className="label border-t border-ink pt-2 !text-ink">
            Added · {diff.added.length}
          </h3>
          <div className="mt-4">
            <SessionRows rows={diff.added} tone="ink" />
          </div>
        </section>
      ) : null}

      {diff.removed.length > 0 ? (
        <section aria-labelledby="removed-h">
          <h3 id="removed-h" className="label border-t border-ink pt-2 !text-ink">
            {deleteRemoved ? "Removed" : "In the database but not in the CSV"} · {diff.removed.length}
          </h3>
          <p className="mt-2 font-serif text-[1.02rem] italic text-ink-soft">
            {deleteRemoved
              ? "These rows will be deleted on apply."
              : "Kept as they are. Tick \"delete removed\" and check again to drop them."}
          </p>
          <div className="mt-4">
            <SessionRows rows={diff.removed} tone="soft" />
          </div>
        </section>
      ) : null}
    </div>
  );
}
