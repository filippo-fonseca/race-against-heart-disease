import { ChartFrame, chartSports, sportFill } from "./frame";
import { SportPill } from "../SportPill";
import { fmtHours } from "../format";
import type { WeekSlot } from "../model";

const W = 324;
const H = 128;
const LEFT = 18;
const BOTTOM = 14;
const TOP = 6;

/** Thin stacked bars, one per week of the window: logged hours only, stacked SWIM, BIKE, RUN, LIFT. */
export function WeeklyHours({ slots, currentWeek }: { slots: WeekSlot[]; currentWeek: number }) {
  const plot = { x0: LEFT, x1: W - 2, y0: TOP, y1: H - BOTTOM };
  const n = slots.length;
  const pitch = (plot.x1 - plot.x0) / n;
  const bar = Math.max(3, pitch * 0.5);
  const maxSec = Math.max(3600 * 2, ...slots.map((s) => s.totalSec));
  // Four or five hairlines whatever the scale: 2h steps up to 10h, then 5h, then 10h.
  const rawMax = maxSec / 3600;
  const tickStep = rawMax <= 10 ? 2 : rawMax <= 25 ? 5 : 10;
  const maxH = Math.ceil(rawMax / tickStep) * tickStep;
  const y = (sec: number) => plot.y1 - ((sec / 3600) / maxH) * (plot.y1 - plot.y0);
  const ticks = Array.from({ length: maxH / tickStep + 1 }, (_, i) => i * tickStep);

  const done = slots.filter((s) => s.week <= currentWeek);
  const logged = done.reduce((s, w) => s + w.totalSec, 0);
  const weeksIn = Math.max(1, Math.min(currentWeek, slots.length));

  return (
    <ChartFrame
      title="Hours per week"
      meta={`${fmtHours(logged)} h logged`}
      label="Weekly training hours by sport"
      summary={`Stacked weekly hours by sport from Strava: swim, bike, run and lift. ${fmtHours(logged)} hours logged over ${weeksIn} ${weeksIn === 1 ? "week" : "weeks"}.`}
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
        {slots.map((s, i) => {
          const x = plot.x0 + i * pitch + (pitch - bar) / 2;
          let acc = 0;
          return (
            <g key={s.week} className="wk-bar" data-week={s.week}>
              {chartSports.map((sport) => {
                const sec = s.bySportSec[sport];
                if (!sec) return null;
                const top = y(acc + sec);
                const bottom = y(acc);
                acc += sec;
                return (
                  <rect
                    key={sport}
                    x={x}
                    y={top}
                    width={bar}
                    height={Math.max(0.5, bottom - top)}
                    fill={sportFill[sport]}
                    shapeRendering="crispEdges"
                  />
                );
              })}
              {s.totalSec === 0 && s.week <= currentWeek ? (
                <line x1={x} x2={x + bar} y1={plot.y1} y2={plot.y1} stroke="var(--ink)" strokeWidth={1} />
              ) : null}
              {s.week % 4 === 1 ? (
                <text x={plot.x0 + i * pitch + pitch / 2} y={H - 3} fontSize={8} textAnchor="middle">
                  {s.week}
                </text>
              ) : null}
            </g>
          );
        })}
        <line x1={plot.x0} x2={plot.x1} y1={plot.y1} y2={plot.y1} stroke="var(--ink)" strokeWidth={1} shapeRendering="crispEdges" />
      </svg>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {chartSports.map((s) => (
          <li key={s}>
            <SportPill sport={s} />
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
