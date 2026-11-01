import type { MatchStatus } from "@/lib/training/types";

const glyph: Record<MatchStatus, { mark: string; text: string; className: string }> = {
  done: { mark: "●", text: "Done", className: "text-red" },
  partial: { mark: "◐", text: "Partial", className: "text-red" },
  missed: { mark: "○", text: "Missed", className: "text-ink-soft" },
  upcoming: { mark: "◌", text: "Upcoming", className: "text-ink-soft" },
  rest: { mark: "-", text: "Rest", className: "text-ink-soft" },
};

/** One Courier glyph per match status, with the word for screen readers. */
export function StatusGlyph({ status, className = "" }: { status: MatchStatus; className?: string }) {
  const g = glyph[status];
  return (
    <span className={`num inline-block w-[1ch] text-center ${g.className} ${className}`}>
      <span aria-hidden="true">{g.mark}</span>
      <span className="sr-only">{g.text}</span>
    </span>
  );
}
