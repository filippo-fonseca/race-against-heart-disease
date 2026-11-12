import { bucketOf, type Sport, type SportBucket } from "@/lib/training/types";
import { sportFill } from "./charts/frame";

/** Uppercase pill label per bucket. LIFT is `strength` internally. */
export const pillLabel: Record<SportBucket, string> = {
  swim: "SWIM",
  bike: "BIKE",
  run: "RUN",
  strength: "LIFT",
};

/** Text on each fill, picked for contrast against the sportFill swatch. */
const pillText: Record<SportBucket, string> = {
  swim: "var(--ink)",
  bike: "#ffffff",
  run: "#ffffff",
  strength: "var(--ink)",
};

/**
 * Compact rounded pill naming the sport: SWIM, BIKE, RUN or LIFT. Colors match
 * the chart palette (sportFill), so a pill in the log reads like its bar in the
 * rail.
 */
export function SportPill({
  sport,
  className = "",
}: {
  sport: Sport;
  className?: string;
}) {
  const b = bucketOf(sport);
  return (
    <span
      className={`inline-flex h-[1.15rem] shrink-0 items-center rounded-full px-[0.45rem] font-mono text-[0.62rem] font-bold leading-none tracking-[0.1em] ${className}`}
      style={{ background: sportFill[b], color: pillText[b] }}
    >
      {pillLabel[b]}
    </span>
  );
}
