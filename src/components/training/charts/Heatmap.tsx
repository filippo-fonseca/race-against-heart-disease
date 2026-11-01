import { ChartFrame } from "./frame";
import { fmtMonth } from "../format";

const CELL = 11;
const GAP = 3;
const PITCH = CELL + GAP;
const LEFT = 16;
const TOP = 13;
const DOW = ["M", "", "W", "", "F", "", "S"];

/**
 * Calendar heatmap: one column per program week, Monday on top.
 * Red intensity scales with minutes trained that day.
 */
export function Heatmap({
  start,
  totalWeeks,
  today,
  raceDay,
  minutes,
  addDays,
}: {
  start: string;
  totalWeeks: number;
  today: string;
  raceDay: string;
  /** minutes trained per YYYY-MM-DD */
  minutes: Map<string, number>;
  addDays: (iso: string, n: number) => string;
}) {
  const width = LEFT + totalWeeks * PITCH;
  const height = TOP + 7 * PITCH + 4;

  const cells: { x: number; y: number; date: string; week: number; min: number }[] = [];
  const months: { x: number; text: string }[] = [];
  let lastMonth = "";

  for (let w = 0; w < totalWeeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      cells.push({ x: LEFT + w * PITCH, y: TOP + d * PITCH, date, week: w + 1, min: minutes.get(date) ?? 0 });
      if (d === 0) {
        const m = fmtMonth(date);
        if (m !== lastMonth) {
          months.push({ x: LEFT + w * PITCH, text: m });
          lastMonth = m;
        }
      }
    }
  }

  const trained = cells.filter((c) => c.min > 0).length;
  const pastDays = cells.filter((c) => c.date < today).length;

  return (
    <ChartFrame
      title="Calendar"
      meta={`${trained} / ${pastDays} days`}
      label="Calendar heatmap of training days"
      summary={`Training days since the program started: ${trained} of ${pastDays} days so far had at least one session. Darker red means more minutes.`}
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" shapeRendering="crispEdges">
        {months.map((m) => (
          <text key={m.x + m.text} x={m.x} y={8} fontSize={8}>
            {m.text.toUpperCase()}
          </text>
        ))}
        {DOW.map((l, i) =>
          l ? (
            <text key={i} x={0} y={TOP + i * PITCH + CELL - 2} fontSize={8}>
              {l}
            </text>
          ) : null,
        )}
        {cells.map((c) => {
          const future = c.date > today;
          const isToday = c.date === today;
          const isRace = c.date === raceDay;
          const t = Math.min(1, c.min / 150);
          const fill = c.min > 0 ? "var(--red)" : future ? "#f3f0eb" : "none";
          const opacity = c.min > 0 ? 0.18 + 0.82 * t : 1;
          return (
            <rect
              key={c.date}
              x={c.x}
              y={c.y}
              width={CELL}
              height={CELL}
              fill={fill}
              fillOpacity={opacity}
              stroke={isRace ? "var(--red)" : isToday ? "var(--ink)" : c.min > 0 || future ? "none" : "var(--rule)"}
              strokeWidth={1}
            />
          );
        })}
        {/* hairline bracket under the week being read; toggled by the scroll spy */}
        {Array.from({ length: totalWeeks }, (_, w) => (
          <line
            key={w}
            className="wk-mark"
            data-week={w + 1}
            x1={LEFT + w * PITCH}
            x2={LEFT + w * PITCH + CELL}
            y1={height - 1}
            y2={height - 1}
            stroke="var(--ink)"
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <div className="label mt-2 flex justify-between !tracking-[0.06em]">
        <span>Nov 2</span>
        <span className="!text-red">Race day, Apr 4</span>
      </div>
    </ChartFrame>
  );
}
