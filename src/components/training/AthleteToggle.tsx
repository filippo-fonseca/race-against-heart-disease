import Link from "next/link";
import type { Athlete } from "@/lib/training/types";
import type { AthleteFilter } from "./model";

/** Plain underlined mono links; the selection lives in `?athlete=`. */
export function AthleteToggle({ athletes, selected }: { athletes: Athlete[]; selected: AthleteFilter }) {
  const options: { value: AthleteFilter; text: string }[] = [
    ...athletes.map((a) => ({ value: a.slug as AthleteFilter, text: a.name })),
    { value: "both", text: "Both" },
  ];
  return (
    <nav aria-label="Athlete" className="inline-flex items-center rounded-full p-0.5 shadow-[0_0_0_1px_var(--rule)]">
      {options.map((o) => {
        const active = o.value === selected;
        return (
          <Link
            key={o.value}
            href={o.value === "both" ? "/training" : `/training?athlete=${o.value}`}
            aria-current={active ? "page" : undefined}
            className={`label inline-flex h-7 items-center rounded-full px-3 !tracking-[0.06em] transition-colors ${
              active ? "bg-ink !text-paper" : "hover:!text-ink"
            }`}
          >
            {o.text}
          </Link>
        );
      })}
    </nav>
  );
}
