import type { Activity } from "@/lib/training/types";
import { ChartFrame } from "./frame";
import { hrBins } from "../model";

const W = 324;
const H = 110;
const LEFT = 18;
const RIGHT = 2;
const TOP = 6;
const BOTTOM = 14;

/**
 * Minutes spent by average heart rate, in 10 bpm bins. The grey bars are the
 * whole program; the red overlay is the week being read (scroll spy).
 */
export function HrHistogram({
  activities,
  weekNumberOf,
  totalWeeks,
}: {
  activities: Activity[];
  weekNumberOf: (date: string) => number;
  totalWeeks: number;
}) {
  const plot = { x0: LEFT, x1: W - RIGHT, y0: TOP, y1: H - BOTTOM };
  const all = hrBins(activities);
  const n = all.length;
  const pitch = (plot.x1 - plot.x0) / n;
  const bar = pitch * 0.62;
  const maxMin = Math.max(60, ...all.map((b) => b.minutes));
  const y = (min: number) => plot.y1 - (min / maxMin) * (plot.y1 - plot.y0);

  const perWeek = Array.from({ length: totalWeeks }, (_, i) =>
    hrBins(activities.filter((a) => weekNumberOf(a.date) === i + 1)),
  );

  const withHr = activities.filter((a) => a.avgHr != null);
  const totalMin = withHr.reduce((s, a) => s + a.movingTimeSec / 60, 0);
  const weighted = withHr.reduce((s, a) => s + (a.avgHr ?? 0) * (a.movingTimeSec / 60), 0);
  const mean = totalMin ? Math.round(weighted / totalMin) : 0;
  const ticks = [Math.round(maxMin / 2), Math.round(maxMin)];

  return (
    <ChartFrame
      title="Heart rate"
      meta={mean ? `${mean} bpm avg` : "no data"}
      label="Histogram of training minutes by average heart rate"
      summary={`Minutes trained by average heart rate in 10 bpm bins. Time-weighted mean is ${mean} bpm across ${withHr.length} sessions with heart-rate data.`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={plot.x0} x2={plot.x1} y1={y(t)} y2={y(t)} stroke="var(--rule)" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={0} y={y(t) + 3} fontSize={8}>
              {t >= 60 ? `${Math.round(t / 60)}h` : `${t}m`}
            </text>
          </g>
        ))}
        {all.map((b, i) => {
          const x = plot.x0 + i * pitch + (pitch - bar) / 2;
          return (
            <g key={b.lo}>
              <rect
                x={x}
                y={y(b.minutes)}
                width={bar}
                height={Math.max(0, plot.y1 - y(b.minutes))}
                fill="#cfc9c1"
                shapeRendering="crispEdges"
              />
              {i % 2 === 1 ? (
                <text x={plot.x0 + i * pitch} y={H - 3} fontSize={8} textAnchor="middle">
                  {b.lo}
                </text>
              ) : null}
            </g>
          );
        })}
        {perWeek.map((bins, w) => (
          <g key={w} className="wk-hr" data-week={w + 1}>
            {bins.map((b, i) => {
              if (!b.minutes) return null;
              const x = plot.x0 + i * pitch + (pitch - bar) / 2;
              return (
                <rect
                  key={b.lo}
                  x={x}
                  y={y(b.minutes)}
                  width={bar}
                  height={Math.max(0.5, plot.y1 - y(b.minutes))}
                  fill="var(--red)"
                  shapeRendering="crispEdges"
                />
              );
            })}
          </g>
        ))}
        <line x1={plot.x0} x2={plot.x1} y1={plot.y1} y2={plot.y1} stroke="var(--ink)" strokeWidth={1} shapeRendering="crispEdges" />
        <text x={plot.x1} y={H - 3} fontSize={8} textAnchor="end">
          BPM
        </text>
      </svg>
      <div className="label mt-2 !tracking-[0.06em]">
        <span className="inline-block h-[7px] w-[7px] bg-red align-middle" aria-hidden="true" /> week in view
      </div>
    </ChartFrame>
  );
}
