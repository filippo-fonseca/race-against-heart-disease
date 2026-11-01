import type { Activity, Sport } from "@/lib/training/types";
import { ChartFrame, sportFill } from "./frame";
import { fmtKm, raceLegM, sportLabel } from "../format";

const W = 324;
const H = 128;
const LEFT = 18;
const RIGHT = 2;
const TOP = 6;
const BOTTOM = 14;
const LEGS: Sport[] = ["swim", "bike", "run"];

/**
 * Cumulative distance per discipline, each expressed as multiples of its race
 * leg (1.9 km swim, 90 km bike, 21.1 km run) so the three lines share one axis.
 */
export function Cumulative({
  activities,
  start,
  totalDays,
  today,
  totalWeeks,
  daysBetween,
}: {
  activities: Activity[];
  start: string;
  totalDays: number;
  today: string;
  totalWeeks: number;
  daysBetween: (a: string, b: string) => number;
}) {
  const plot = { x0: LEFT, x1: W - RIGHT, y0: TOP, y1: H - BOTTOM };
  // Clamp to the program window: before day one there is nothing to draw past x = 0.
  const todayIdx = Math.max(0, Math.min(totalDays, daysBetween(start, today)));

  // Per-sport running totals, one point per day through today.
  const series: Record<Sport, number[]> = { swim: [], bike: [], run: [], strength: [], other: [] };
  const perDay: Record<Sport, number[]> = {
    swim: new Array(todayIdx + 1).fill(0),
    bike: new Array(todayIdx + 1).fill(0),
    run: new Array(todayIdx + 1).fill(0),
    strength: [],
    other: [],
  };
  for (const a of activities) {
    if (!LEGS.includes(a.sport)) continue;
    const i = daysBetween(start, a.date);
    if (i < 0 || i > todayIdx) continue;
    perDay[a.sport][i] += a.distanceM;
  }
  for (const s of LEGS) {
    let acc = 0;
    series[s] = perDay[s].map((m) => (acc += m));
  }

  const multiples = (s: Sport, m: number) => m / (raceLegM[s] ?? 1);
  const finals = LEGS.map((s) => ({ sport: s, m: series[s][todayIdx] ?? 0 }));
  const maxMult = Math.max(1, ...finals.map((f) => multiples(f.sport, f.m)));
  const yMax = Math.ceil(maxMult);

  const x = (i: number) => plot.x0 + (i / totalDays) * (plot.x1 - plot.x0);
  const y = (mult: number) => plot.y1 - (mult / yMax) * (plot.y1 - plot.y0);

  const path = (s: Sport) =>
    series[s]
      .map((m, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(multiples(s, m)).toFixed(1)}`)
      .join(" ");

  const ticks = Array.from({ length: yMax + 1 }, (_, i) => i).filter((t) => yMax <= 6 || t % 2 === 0);

  return (
    <ChartFrame
      title="Race legs"
      meta={finals.map((f) => `${sportLabel[f.sport][0]} ${multiples(f.sport, f.m).toFixed(1)}×`).join(" · ")}
      label="Cumulative distance per discipline as multiples of the race leg"
      summary={finals
        .map(
          (f) =>
            `${sportLabel[f.sport]}: ${fmtKm(f.m, f.sport)} km so far, ${multiples(f.sport, f.m).toFixed(1)} times the ${fmtKm(raceLegM[f.sport] ?? 0, f.sport)} km race leg.`,
        )
        .join(" ")}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={plot.x0} x2={plot.x1} y1={y(t)} y2={y(t)} stroke="var(--rule)" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={0} y={y(t) + 3} fontSize={8}>
              {t}×
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
        {LEGS.map((s) => (
          <path key={s} d={path(s)} fill="none" stroke={sportFill[s]} strokeWidth={s === "bike" ? 1.5 : 1.25} strokeLinejoin="round" />
        ))}
        {finals.map((f) => (
          <circle key={f.sport} cx={x(todayIdx)} cy={y(multiples(f.sport, f.m))} r={2} fill={sportFill[f.sport]} />
        ))}
        <line x1={plot.x0} x2={plot.x1} y1={plot.y1} y2={plot.y1} stroke="var(--ink)" strokeWidth={1} shapeRendering="crispEdges" />
        <text x={plot.x0} y={H - 3} fontSize={8}>
          NOV 2
        </text>
        <text x={plot.x1} y={H - 3} fontSize={8} textAnchor="end">
          APR 4
        </text>
      </svg>
      <ul className="mt-2 grid grid-cols-3 gap-2">
        {finals.map((f) => (
          <li key={f.sport} className="label flex items-baseline gap-1.5 !tracking-[0.06em]">
            <span className="inline-block h-[7px] w-[7px] shrink-0" style={{ background: sportFill[f.sport] }} aria-hidden="true" />
            <span className="!text-ink">{fmtKm(f.m, f.sport)}</span> km
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
