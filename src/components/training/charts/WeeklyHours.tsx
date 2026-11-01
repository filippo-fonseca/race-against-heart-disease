import { ChartFrame, Legend, chartSports, sportFill } from "./frame";
import { fmtHours } from "../format";
import type { WeekSlot } from "../model";

const W = 324;
const H = 128;
const LEFT = 18;
const BOTTOM = 14;
const TOP = 6;

/** Thin stacked bars, one per program week, with the plan drawn as a step line. */
export function WeeklyHours({ slots, currentWeek }: { slots: WeekSlot[]; currentWeek: number }) {
  const plot = { x0: LEFT, x1: W - 2, y0: TOP, y1: H - BOTTOM };
  const n = slots.length;
  const pitch = (plot.x1 - plot.x0) / n;
  const bar = Math.max(3, pitch * 0.5);
  const maxSec = Math.max(
    3600 * 2,
    ...slots.map((s) => Math.max(s.totalSec, s.plannedSec)),
  );
  // Four or five hairlines whatever the scale: 2h steps up to 10h, then 5h, then 10h.
  const rawMax = maxSec / 3600;
  const tickStep = rawMax <= 10 ? 2 : rawMax <= 25 ? 5 : 10;
  const maxH = Math.ceil(rawMax / tickStep) * tickStep;
  const y = (sec: number) => plot.y1 - ((sec / 3600) / maxH) * (plot.y1 - plot.y0);
  const ticks = Array.from({ length: maxH / tickStep + 1 }, (_, i) => i * tickStep);

  const planPath = slots
    .map((s, i) => {
      const x0 = plot.x0 + i * pitch;
      const yy = y(s.plannedSec);
      return `${i === 0 ? "M" : "L"}${x0.toFixed(1)} ${yy.toFixed(1)} H${(x0 + pitch).toFixed(1)}`;
    })
    .join(" ");

  const done = slots.filter((s) => s.week <= currentWeek);
  const actual = done.reduce((s, w) => s + w.totalSec, 0);
  const planned = done.reduce((s, w) => s + w.plannedSec, 0);

  return (
    <ChartFrame
      title="Hours per week"
      meta={`${fmtHours(actual)} of ${fmtHours(planned)} h`}
      label="Weekly training hours by sport against the plan"
      summary={`Stacked weekly hours by sport. ${fmtHours(actual)} hours done against ${fmtHours(planned)} planned through week ${currentWeek}. The thin stepped line is the plan.`}
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
        <path d={planPath} fill="none" stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 2" />
        <line x1={plot.x0} x2={plot.x1} y1={plot.y1} y2={plot.y1} stroke="var(--ink)" strokeWidth={1} shapeRendering="crispEdges" />
      </svg>
      <Legend
        items={[
          { sport: "swim", text: "Swim" },
          { sport: "bike", text: "Bike" },
          { sport: "run", text: "Run" },
          { sport: "strength", text: "Strength" },
        ]}
      />
    </ChartFrame>
  );
}
