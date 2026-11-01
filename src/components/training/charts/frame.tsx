import type { ReactNode } from "react";
import type { Sport } from "@/lib/training/types";

/** Sport encoding within the palette. Red is reserved for the bike (the longest leg). */
export const sportFill: Record<Sport, string> = {
  swim: "#b4ada5",
  bike: "var(--red)",
  run: "var(--ink)",
  strength: "#dcd7d0",
  other: "#ebe7e1",
};

/** Sports that get their own layer in the charts, in stack order (bottom first). */
export const chartSports: Sport[] = ["swim", "bike", "run", "strength"];

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

/** Tiny legend row, mono labels with a square swatch each. */
export function Legend({ items }: { items: { sport: Sport; text: string }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((it) => (
        <li key={it.sport} className="label flex items-center gap-1.5 !tracking-[0.06em]">
          <span
            className="inline-block h-[7px] w-[7px]"
            style={{ background: sportFill[it.sport] }}
            aria-hidden="true"
          />
          {it.text}
        </li>
      ))}
    </ul>
  );
}
