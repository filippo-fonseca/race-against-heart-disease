import type { CSSProperties } from "react";
import type { Activity, Athlete, DayMatch, PlanSession } from "@/lib/training/types";
import { fmtClock, fmtDay, fmtHM, fmtKm, fmtWeekRange, sportLabel, sportVerb } from "./format";
import type { WeekGroup } from "./model";
import { Photos } from "./Photos";
import { SportPill } from "./SportPill";
import { StatusGlyph } from "./StatusGlyph";

const step = (i: number) => ({ "--i": i }) as CSSProperties;

function list(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "Planned 60 min Z2 ride. Rode 62 min, 145 bpm avg." */
export function autoNote(m: DayMatch, today: string): string {
  const planned = m.planned.map((p) => `${p.targetMin ?? 0} min ${sportLabel[p.sport].toLowerCase()}`);
  const did = m.actual.map((a) => {
    const mins = Math.round(a.movingTimeSec / 60);
    const hr = a.avgHr ? `, ${a.avgHr} bpm avg` : "";
    return `${sportVerb[a.sport]} ${mins} min${hr}`;
  });

  if (m.status === "upcoming") {
    const when = m.date === today ? "Today: " : "";
    return `${when}${planned.length ? `Planned ${list(planned)}.` : "Rest."}`;
  }
  if (m.status === "rest") return did.length ? `Unplanned. ${did.join(". ")}.` : "Rest day.";
  if (m.status === "missed") return `Planned ${list(planned)}. Nothing logged.`;
  if (planned.length === 0) return `Unplanned. ${did.join(". ")}.`;
  return `Planned ${list(planned)}. ${did.join(". ")}.`;
}

function PlannedLine({ p, status }: { p: PlanSession; status: DayMatch["status"] }) {
  return (
    <li className="flex gap-2">
      <StatusGlyph status={status} className="mt-[0.2rem] shrink-0" />
      <div className="min-w-0">
        <div className="num text-[0.82rem] text-ink">
          {p.title}
          <span className="text-ink-soft">
            {p.targetMin ? ` · ${p.targetMin} min` : ""}
            {p.targetKm ? ` · ${p.targetKm} km` : ""}
          </span>
        </div>
        {p.detail ? <div className="font-serif text-[0.98rem] italic leading-snug text-ink-soft">{p.detail}</div> : null}
      </div>
    </li>
  );
}

function ActualLine({ a }: { a: Activity }) {
  const bits = [
    fmtClock(a.startLocal),
    fmtHM(a.movingTimeSec),
    a.distanceM > 0 ? `${fmtKm(a.distanceM, a.sport)} km` : null,
    a.avgHr ? `${a.avgHr} bpm` : null,
    a.avgWatts ? `${a.avgWatts} w` : null,
  ].filter(Boolean);
  return (
    <li>
      <div className="num flex flex-wrap items-center gap-x-2 text-[0.82rem] text-ink">
        <SportPill sport={a.sport} />
        {bits.join(" · ")}
        <span className="ml-2 text-ink-soft">{a.name}</span>
      </div>
      {a.description ? <div className="font-serif text-[0.98rem] italic text-ink-soft">{a.description}</div> : null}
      <Photos photos={a.photos} alt={`${a.name}, ${fmtDay(a.date)}`} />
    </li>
  );
}

function DayBody({ m, today, athleteName }: { m: DayMatch; today: string; athleteName: string | null }) {
  const planStatus = m.status === "rest" ? "rest" : m.status;
  const quiet = m.status === "rest" && m.actual.length === 0;
  return (
    <div className={`min-w-0 ${quiet ? "text-ink-soft" : ""}`}>
      {athleteName ? <div className="label mb-1.5 !text-ink">{athleteName}</div> : null}
      {m.planned.length > 0 ? (
        <ul className="space-y-1.5">
          {m.planned.map((p) => (
            <PlannedLine key={p.id} p={p} status={planStatus} />
          ))}
        </ul>
      ) : (
        <div className="flex gap-2">
          <StatusGlyph status={m.actual.length ? "done" : "rest"} className="mt-[0.2rem]" />
          <span className="num text-[0.82rem]">{m.actual.length ? "Unplanned" : "Rest"}</span>
        </div>
      )}
      {m.actual.length > 0 ? (
        <ul className="mt-2.5 space-y-2 border-l border-rule pl-3">
          {m.actual.map((a) => (
            <ActualLine key={a.id} a={a} />
          ))}
        </ul>
      ) : null}
      <p className={`mt-2.5 font-serif text-[1.05rem] leading-snug ${quiet ? "text-ink-soft" : "text-ink"}`}>{autoNote(m, today)}</p>
    </div>
  );
}

/**
 * The log: weeks newest first, days newest first inside each. Each week is a
 * `data-week-section` the ScrollSpy watches.
 */
export function Log({
  weeks,
  athletes,
  today,
  showAthlete,
}: {
  weeks: WeekGroup[];
  athletes: Athlete[];
  today: string;
  showAthlete: boolean;
}) {
  const nameOf = (slug: string) => athletes.find((a) => a.slug === slug)?.name ?? slug;
  return (
    <div className="space-y-14">
      {weeks.map((w, wi) => (
        <section
          key={w.week}
          data-week-section={w.week}
          data-week-label={`Week ${w.week} · ${fmtWeekRange(w.weekStart)}`}
          aria-labelledby={`week-${w.week}`}
          className={wi < 2 ? "rise" : ""}
          style={step(4 + wi)}
        >
          <h2
            id={`week-${w.week}`}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-ink pt-2"
          >
            <span className="label !text-ink">
              Week {w.week}
              {w.phase ? ` · ${w.phase}` : ""}
            </span>
            <span className="label">
              <span className="!text-ink">{fmtHM(w.actualSec)}</span> of {fmtHM(w.plannedSec)} planned · {fmtWeekRange(w.weekStart)}
            </span>
          </h2>
          <ol className="mt-5 space-y-7">
            {w.days.map((d) => {
              const isToday = d.date === today;
              return (
                <li key={d.date} className="grid gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-6">
                  <div className={`num text-[0.82rem] ${isToday ? "text-red" : "text-ink-soft"}`}>
                    <time dateTime={d.date}>{fmtDay(d.date)}</time>
                    {isToday ? <div className="label !text-red">Today</div> : null}
                  </div>
                  <div className="space-y-5">
                    {d.perAthlete.map((m) => (
                      <DayBody key={m.athlete} m={m} today={today} athleteName={showAthlete ? nameOf(m.athlete) : null} />
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
