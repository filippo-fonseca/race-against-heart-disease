"use client";

import Link from "next/link";
import { useActionState } from "react";
import { applyPlan, checkPlan } from "@/app/admin/actions";
import type { ApplyState, CheckState } from "@/app/admin/types";
import { DiffPreview } from "./DiffPreview";
import { plural } from "./format";

const idleCheck: CheckState = { status: "idle" };
const idleApply: ApplyState = { status: "idle" };

const field = "num block w-full rounded-none border-0 border-b border-ink bg-transparent px-0 text-[0.9rem] text-ink outline-none focus:border-red";

function Choice({ name, value, label, note, defaultChecked, type = "radio" }: { name: string; value: string; label: string; note: string; defaultChecked?: boolean; type?: "radio" | "checkbox" }) {
  const id = `${name}-${value}`;
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input id={id} type={type} name={name} value={value} defaultChecked={defaultChecked} className="mt-[0.3rem] h-3.5 w-3.5 accent-[var(--red)]" />
      <span>
        <span className="num block text-[0.9rem] text-ink">{label}</span>
        <span className="block font-serif text-[0.98rem] italic leading-snug text-ink-soft">{note}</span>
      </span>
    </label>
  );
}

/**
 * Section 2 and 3 of the admin page: upload, Check, preview, Apply. The CSV
 * text travels back to the server with Apply; the server re-parses and
 * re-diffs it rather than trusting the preview.
 */
export function PlanUpload() {
  const [check, checkAction, checking] = useActionState(checkPlan, idleCheck);
  const [apply, applyAction, applying] = useActionState(applyPlan, idleApply);

  const checked = check.status === "ready" || check.status === "invalid" ? check : null;

  return (
    <section aria-labelledby="upload-h" className="mt-14">
      <h2 id="upload-h" className="label border-t border-ink pt-2 !text-ink">
        Upload
      </h2>

      <form action={checkAction} className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16">
        <div className="min-w-0 space-y-6">
          <div>
            <label htmlFor="file" className="label block">
              CSV file
            </label>
            <input id="file" name="file" type="file" accept=".csv,text/csv" className={`${field} h-11 py-2 file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1 file:font-serif file:text-[0.9rem] file:text-paper`} />
          </div>
          <div>
            <label htmlFor="csv" className="label block">
              Or paste
            </label>
            <textarea
              id="csv"
              name="csv"
              rows={8}
              spellCheck={false}
              placeholder="date,sport,title,detail,target_min,target_km,athletes,phase,week,id"
              defaultValue={checked?.csv ?? ""}
              className={`${field} mt-2 resize-y leading-relaxed placeholder:text-ink-faint`}
            />
          </div>
        </div>

        <fieldset className="space-y-5">
          <legend className="label">Scope</legend>
          <Choice name="scope" value="csv-range" label="csv-range" note="Only rows inside the CSV's date range can count as removed." defaultChecked={checked?.options.scope !== "all"} />
          <Choice name="scope" value="all" label="all" note="Every database row missing from the CSV counts as removed." defaultChecked={checked?.options.scope === "all"} />
          <div className="border-t border-rule pt-5">
            <Choice type="checkbox" name="deleteRemoved" value="on" label="delete removed" note="Off by default: removed rows are listed but kept." defaultChecked={checked?.options.deleteRemoved ?? false} />
          </div>
          <button type="submit" disabled={checking} className="pill pill-ghost disabled:opacity-60">
            {checking ? "Checking" : "Check"}
          </button>
        </fieldset>
      </form>

      {check.status === "error" ? (
        <p role="alert" className="label mt-6 !text-red">
          {check.message}
        </p>
      ) : null}

      {check.status === "invalid" ? (
        <div className="mt-8" role="alert">
          <h3 className="label border-t border-red pt-2 !text-red">
            {plural(check.errors.length, "error")} · nothing can be applied until the CSV parses
          </h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-ink">
                  <th scope="col" className="label w-16 py-2 pr-3 text-left font-normal">Line</th>
                  <th scope="col" className="label py-2 text-left font-normal">Problem</th>
                </tr>
              </thead>
              <tbody>
                {check.errors.map((e, i) => (
                  <tr key={`${e.line}-${i}`} className="border-b border-rule align-top">
                    <td className="num py-2 pr-3 text-[0.8rem] text-red">{e.line}</td>
                    <td className="num py-2 text-[0.8rem] text-ink">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="label mt-3">{plural(check.rows, "row")} parsed cleanly.</p>
        </div>
      ) : null}

      {check.status === "ready" ? (
        <>
          <DiffPreview diff={check.diff} deleteRemoved={check.options.deleteRemoved} />

          <form action={applyAction} className="mt-10 flex flex-wrap items-center gap-4 border-t border-ink pt-6">
            <input type="hidden" name="csv" value={check.csv} />
            <input type="hidden" name="scope" value={check.options.scope} />
            {check.options.deleteRemoved ? <input type="hidden" name="deleteRemoved" value="on" /> : null}
            <button type="submit" disabled={applying || apply.status === "done"} className="pill pill-red disabled:opacity-60">
              {applying ? "Applying" : apply.status === "done" ? "Applied" : "Apply"}
            </button>
            <span className="label">
              scope {check.options.scope} · delete removed {check.options.deleteRemoved ? "on" : "off"}
            </span>
          </form>

          {apply.status === "error" ? (
            <p role="alert" className="label mt-4 !text-red">
              {apply.message}
            </p>
          ) : null}
          {apply.status === "done" ? (
            <p role="status" className="mt-4 font-serif text-[1.1rem] text-ink">
              Done. {plural(apply.result.added, "session")} added, {apply.result.changed} changed, {apply.result.removed} removed.{" "}
              <Link href="/training" className="underline decoration-rule underline-offset-4 hover:text-red">
                See the training page
              </Link>
              .
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
