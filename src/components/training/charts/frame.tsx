import type { ReactNode } from "react";
import { SPORTS, type Sport, type SportBucket } from "@/lib/training/types";

/**
 * Sport encoding within the palette. Red is reserved for the bike (the longest
 * leg). LIFT is a warm ochre so it reads on white as a line, a bar and a pill.
 */
export const sportFill: Record<Sport, string> = {
  swim: "#b4ada5",
  bike: "var(--red)",
  run: "var(--ink)",
  strength: "#c08a3e",
  other: "#c08a3e",
};

/** Sports that get their own layer in the charts, in stack order (bottom first). */
export const chartSports: readonly SportBucket[] = SPORTS;

export function ChartFrame({
  title,
  meta,
  label,
  summary,
  children,
  className = "",
}: {
  title: string;
  /** Right-aligned mono annotation, e.g. a total. */
  meta?: ReactNode;
  /** aria-label for the figure. */
  label: string;
  /** Screen-reader summary of what the chart shows. */
  summary: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={`chart ${className}`} aria-label={label}>
      <figcaption className="flex items-baseline justify-between gap-3 border-t border-ink pt-2">
        <span className="label !text-ink">{title}</span>
        {meta ? <span className="label whitespace-nowrap">{meta}</span> : null}
      </figcaption>
      <p className="sr-only">{summary}</p>
      <div className="mt-3" aria-hidden="true">
        {children}
      </div>
    </figure>
  );
}
