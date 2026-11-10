import type { CSSProperties } from "react";
import type { Activity } from "@/lib/training/types";
import { Cumulative } from "./charts/Cumulative";
import { Heatmap } from "./charts/Heatmap";
import { HrHistogram } from "./charts/HrHistogram";
import { WeeklyHours } from "./charts/WeeklyHours";
import type { WeekSlot } from "./model";

const step = (i: number) => ({ "--i": i }) as CSSProperties;

export interface RailCalendar {
  start: string;
  raceDay: string;
  today: string;
  totalWeeks: number;
  totalDays: number;
  currentWeek: number;
  addDays: (iso: string, n: number) => string;
  daysBetween: (a: string, b: string) => number;
  weekNumberOf: (date: string) => number;
}

/**
 * The chart rail. Sticky on large screens; a horizontally scrollable strip
 * above the log on small ones. Every week-bound mark carries `data-week` so
 * the ScrollSpy can light it up without re-rendering.
 */
export function ChartRail({
  cal,
  minutes,
  slots,
  activities,
  links,
}: {
  cal: RailCalendar;
  minutes: Map<string, number>;
  /** Feed link per trained day, for the calendar. */
  links: Map<string, string>;
  slots: WeekSlot[];
  activities: Activity[];
}) {
  const chart = "min-w-[280px] snap-start lg:min-w-0";
  return (
    <aside className="rail rise lg:sticky lg:top-[4.75rem] lg:max-h-[calc(100vh-5.75rem)] lg:self-start lg:overflow-y-auto" style={step(3)} aria-label="Charts">
      <div className="flex items-baseline justify-between border-b border-rule pb-2 lg:border-0 lg:pb-0">
        <span className="label">Reading</span>
        <span className="label !text-ink" data-week-readout>
          {cal.currentWeek < 1
            ? "Week 1 · upcoming"
            : cal.currentWeek > cal.totalWeeks
              ? `Week ${cal.totalWeeks} · race week`
              : `Week ${cal.currentWeek} · this week`}
        </span>
      </div>
      {/* `relative` so the charts' sr-only summaries (absolute) are clipped by this strip rather than escaping to the sheet */}
      <div className="rail-strip relative -mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 gap-8 overflow-x-auto px-4 pb-2 lg:mx-0 lg:mt-3 lg:flex-col lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0">
        <div className={chart}>
          <Heatmap
            start={cal.start}
            totalWeeks={cal.totalWeeks}
            today={cal.today}
            raceDay={cal.raceDay}
            minutes={minutes}
            links={links}
            addDays={cal.addDays}
          />
        </div>
        <div className={chart}>
          <WeeklyHours slots={slots} currentWeek={cal.currentWeek} />
        </div>
        <div className={chart}>
          <Cumulative
            activities={activities}
            start={cal.start}
            totalDays={cal.totalDays}
            today={cal.today}
            totalWeeks={cal.totalWeeks}
            daysBetween={cal.daysBetween}
            addDays={cal.addDays}
          />
        </div>
        <div className={chart}>
          <HrHistogram activities={activities} weekNumberOf={cal.weekNumberOf} totalWeeks={cal.totalWeeks} />
        </div>
      </div>
    </aside>
  );
}
