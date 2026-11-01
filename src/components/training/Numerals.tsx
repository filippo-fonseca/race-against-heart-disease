import type { CSSProperties } from "react";
import type { TrainingSummary } from "@/lib/training/types";
import { fmtKm } from "./format";

const step = (i: number) => ({ "--i": i }) as CSSProperties;

function Figure({
  value,
  unit,
  label,
  i,
  accent = false,
  className = "",
}: {
  value: string;
  unit?: string;
  label: string;
  i: number;
  accent?: boolean;
  className?: string;
}) {
  // dd above dt visually (figure, then its name) while the list order stays term first.
  return (
    <div className={`rise flex min-w-0 flex-col-reverse ${className}`} style={step(i)}>
      <dt className="label mt-2 whitespace-nowrap">{label}</dt>
      <dd className={`num text-[1.85rem] leading-none tracking-tight sm:text-[2.4rem] ${accent ? "text-red" : "text-ink"}`}>
        {value}
        {unit ? <span className="ml-1 text-[0.95rem] text-ink-soft">{unit}</span> : null}
      </dd>
    </div>
  );
}

/** The big numerals strip under the title. Combines one or more athletes' summaries. */
export function Numerals({ summaries, daysToRace }: { summaries: TrainingSummary[]; daysToRace: number }) {
  const sum = (f: (s: TrainingSummary) => number) => summaries.reduce((a, s) => a + f(s), 0);
  const totalSec = sum((s) => s.totalTimeSec);
  const hours = Math.floor(totalSec / 3600);
  const sessions = sum((s) => s.sessions);
  const streak = summaries.length ? Math.min(...summaries.map((s) => s.streakDays)) : 0;
  const swim = sum((s) => s.bySport.swim.distanceM);
  const bike = sum((s) => s.bySport.bike.distanceM);
  const run = sum((s) => s.bySport.run.distanceM);

  return (
    <dl className="grid grid-cols-3 gap-x-6 gap-y-8 border-y border-ink py-6 sm:grid-cols-4 lg:grid-cols-7">
      <Figure value={String(daysToRace)} label="Days to race" i={2} accent className="col-span-3 sm:col-span-2 lg:col-span-1" />
      <Figure value={String(hours)} unit="h" label="Trained" i={3} />
      <Figure value={String(sessions)} label="Sessions" i={4} />
      <Figure value={String(streak)} unit={streak === 1 ? "day" : "days"} label="Streak" i={5} />
      <Figure value={fmtKm(swim, "swim")} unit="km" label="Swim" i={6} />
      <Figure value={fmtKm(bike)} unit="km" label="Bike" i={7} />
      <Figure value={fmtKm(run)} unit="km" label="Run" i={8} />
    </dl>
  );
}
