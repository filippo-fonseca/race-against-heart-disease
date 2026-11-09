import { cumulativeTime, totalsBySport } from "@/lib/training/aggregate";
import { SPORTS, type Activity, type SportBucket } from "@/lib/training/types";
import { ChartFrame, sportFill } from "./frame";
import { fmtHours, fmtSportTotal } from "../format";
import { SportPill, pillLabel } from "../SportPill";

const W = 324;
const H = 128;
const LEFT = 18;
const RIGHT = 2;
const TOP = 6;
const BOTTOM = 14;

/**
 * Cumulative hours per sport (SWIM, BIKE, RUN, LIFT) across the window. Time,
 * not distance, so indoor rides with no distance still climb. The legend gives
 * each sport's total by the site's rule: swim and run km, bike and lift time.
 */
export function Cumulative({
  activities,
  start,
  totalDays,
  today,
  totalWeeks,
  daysBetween,
  addDays,
}: {
  activities: Activity[];
  start: string;
  /** Index of race day: days between start and race day. */
  totalDays: number;
  today: string;
  totalWeeks: number;
  daysBetween: (a: string, b: string) => number;
  addDays: (iso: string, n: number) => string;
}) {
  const plot = { x0: LEFT, x1: W - RIGHT, y0: TOP, y1: H - BOTTOM };
  // Clamp to the training window: before day one there is nothing to draw past x = 0.
  const todayIdx = Math.max(0, Math.min(totalDays, daysBetween(start, today)));
  const series = cumulativeTime(activities, start, addDays(start, todayIdx));
  const totals = totalsBySport(activities);

  const finalSec = (s: SportBucket) => series[s][todayIdx] ?? 0;
  const maxH = Math.max(1, ...SPORTS.map((s) => finalSec(s) / 3600));
  const tickStep = maxH <= 4 ? 1 : maxH <= 10 ? 2 : maxH <= 25 ? 5 : 10;
  const yMax = Math.ceil(maxH / tickStep) * tickStep;
  const ticks = Array.from({ length: yMax / tickStep + 1 }, (_, i) => i * tickStep);

  const x = (i: number) => plot.x0 + (i / totalDays) * (plot.x1 - plot.x0);
  const y = (sec: number) => plot.y1 - (sec / 3600 / yMax) * (plot.y1 - plot.y0);
  const path = (s: SportBucket) =>
    series[s].map((sec, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(sec).toFixed(1)}`).join(" ");

  const totalSec = SPORTS.reduce((n, s) => n + finalSec(s), 0);

  return (
    <ChartFrame
      title="Cumulative hours"
      meta={`${fmtHours(totalSec)} h so far`}
      label="Cumulative training hours per sport"
      summary={`Running total of hours per sport since day one. ${SPORTS.map(
        (s) => `${pillLabel[s]}: ${fmtHours(finalSec(s))} hours (${fmtSportTotal(s, totals[s])})`,
      ).join(". ")}.`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={plot.x0} x2={plot.x1} y1={y(t * 3600)} y2={y(t * 3600)} stroke="var(--rule)" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={0} y={y(t * 3600) + 3} fontSize={8}>
              {t}h
            </text>
          </g>
        ))}
        {/* week markers, revealed by the scroll spy */}
        {Array.from({ length: totalWeeks }, (_, w) => (
          <rect
            key={w}
            className="wk-band"
            data-week={w + 1}
            x={x(w * 7)}
            y={plot.y0}
            width={x(7) - x(0)}
            height={plot.y1 - plot.y0}
            fill="var(--ink)"
            fillOpacity={0.06}
          />
        ))}
        <line x1={x(todayIdx)} x2={x(todayIdx)} y1={plot.y0} y2={plot.y1} stroke="var(--rule)" strokeWidth={1} strokeDasharray="2 2" />
        {SPORTS.map((s) => (
          <path key={s} d={path(s)} fill="none" stroke={sportFill[s]} strokeWidth={s === "bike" ? 1.6 : 1.35} strokeLinejoin="round" />
        ))}
        {SPORTS.map((s) => (
          <circle key={s} cx={x(todayIdx)} cy={y(finalSec(s))} r={2} fill={sportFill[s]} />
        ))}
        <line x1={plot.x0} x2={plot.x1} y1={plot.y1} y2={plot.y1} stroke="var(--ink)" strokeWidth={1} shapeRendering="crispEdges" />
        <text x={plot.x0} y={H - 3} fontSize={8}>
          NOV 2
        </text>
        <text x={plot.x1} y={H - 3} fontSize={8} textAnchor="end">
          APR 4
        </text>
      </svg>
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {SPORTS.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <SportPill sport={s} />
            <span className="num text-[0.8rem] text-ink">
              {fmtHours(finalSec(s))} h
              {s === "swim" || s === "run" ? <span className="text-ink-soft"> · {fmtSportTotal(s, totals[s])}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
