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
    <nav aria-label="Athlete" className="flex items-baseline gap-4">
      {options.map((o) => {
        const active = o.value === selected;
        return (
          <Link
            key={o.value}
            href={o.value === "both" ? "/training" : `/training?athlete=${o.value}`}
            aria-current={active ? "page" : undefined}
            className={`label underline-offset-4 ${
              active
                ? "!text-red underline decoration-red"
                : "underline decoration-rule hover:!text-red hover:decoration-red"
            }`}
          >
            {o.text}
          </Link>
        );
      })}
    </nav>
  );
}
