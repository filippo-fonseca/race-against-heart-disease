import type { CSSProperties } from "react";
import { SPORTS, type TrainingSummary } from "@/lib/training/types";
import { fmtSportTotal } from "./format";
import { SportPill } from "./SportPill";

const step = (i: number) => ({ "--i": i }) as CSSProperties;

function Figure({
  value,
  unit,
  label,
  i,
  accent = false,
}: {
  value: string;
  unit?: string;
  label: string;
  i: number;
  accent?: boolean;
}) {
  // dd above dt visually (figure, then its name) while the list order stays term first.
  return (
    <div className="rise flex min-w-0 flex-col-reverse items-center justify-end text-center" style={step(i)}>
      <dt className="label mt-2">{label}</dt>
      <dd className={`num text-[1.85rem] leading-none tracking-tight sm:text-[2.4rem] ${accent ? "text-red" : "text-ink"}`}>
        {value}
        {unit ? <span className="ml-1 text-[0.95rem] text-ink-soft">{unit}</span> : null}
      </dd>
    </div>
  );
}

/**
 * The big numerals under the title, then one total per sport: swims and runs
 * by distance, rides and lifts by time.
 */
export function Numerals({ summary, daysToRace }: { summary: TrainingSummary; daysToRace: number }) {
  const hours = Math.floor(summary.totalTimeSec / 3600);
  return (
    <div className="panel px-4 py-6 sm:px-8">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
        <Figure value={String(daysToRace)} label="Days to IRONMAN Texas" i={2} accent />
        <Figure value={String(hours)} unit="h" label="Trained" i={3} />
        <Figure value={String(summary.sessions)} label="Sessions" i={4} />
        <Figure value={String(summary.activeDays)} label="Active days" i={5} />
        <Figure value={String(summary.restDays)} label="Rest days" i={6} />
      </dl>
      <dl className="rise mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-5 sm:grid-cols-4" style={step(7)}>
        {SPORTS.map((s) => (
          <div key={s} className="flex items-center justify-center gap-2.5">
            <dt className="flex">
              <SportPill sport={s} />
            </dt>
            <dd className="num text-[1.15rem] leading-none text-ink">{fmtSportTotal(s, summary.bySport[s])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
