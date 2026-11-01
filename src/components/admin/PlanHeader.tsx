import { logout } from "@/app/admin/actions";
import { Mark } from "@/components/marks";
import type { PlanStats } from "@/lib/admin/dashboard";
import { site } from "@/lib/site";
import { fmtStamp } from "./format";

function Figure({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="label mt-2 whitespace-nowrap">{label}</dt>
      <dd className={`num truncate text-[1.6rem] leading-none tracking-tight sm:text-[2rem] ${accent ? "text-red" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

/** Section 1: title, the plan's counts, and the three buttons. */
export function PlanHeader({ stats }: { stats: PlanStats }) {
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h1 className="flex items-center gap-3 font-serif text-[2.2rem] leading-none tracking-tight sm:text-[2.8rem]">
            <Mark className="h-8 w-8 text-red sm:h-9 sm:w-9" />
            Plan
          </h1>
          <div className="label mt-3">
            {site.name} · Admin
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/admin/plan.csv" download className="pill pill-ghost !h-9 !px-4 !text-[0.95rem]">
            Download CSV
          </a>
          <a href="/api/admin/template.csv" download className="pill pill-ghost !h-9 !px-4 !text-[0.95rem]">
            Download template
          </a>
          <form action={logout}>
            <button type="submit" className="pill pill-ghost !h-9 !px-4 !text-[0.95rem] text-ink-soft">
              Log out
            </button>
          </form>
        </div>
      </header>
      <div className="mt-6 h-px w-full bg-red" />

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 border-b border-ink pb-6 sm:grid-cols-4">
        <Figure value={String(stats.count)} label="Sessions in DB" accent />
        <Figure value={stats.from ?? "none"} label="First session" />
        <Figure value={stats.to ?? "none"} label="Last session" />
        <Figure value={fmtStamp(stats.updatedAt)} label="Last updated" />
      </dl>
      {stats.error ? (
        <p role="alert" className="label mt-4 !text-red">
          Plan table unavailable: {stats.error}
        </p>
      ) : null}
    </>
  );
}
