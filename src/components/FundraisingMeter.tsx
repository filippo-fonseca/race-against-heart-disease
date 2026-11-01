import { formatUsd, getFundraising } from "@/lib/fundraising";
import { site } from "@/lib/site";

/**
 * Live total from Team IMF. Past the goal the bar stays full and the
 * percentage keeps counting, so 100%+ reads as the achievement it is.
 */
export async function FundraisingMeter({ className = "" }: { className?: string }) {
  const f = await getFundraising();
  const pct = Math.round(f.progress * 100);
  const fill = Math.min(f.progress, 1);
  const over = f.progress > 1;

  return (
    <section className={className} aria-label="Fundraising progress">
      <div className="flex items-baseline justify-between gap-4">
        <div className="num text-[1.9rem] leading-none text-red">
          {formatUsd(f.raisedUsd)}
        </div>
        <div className="label tabular-nums">
          {pct}% of {formatUsd(f.goalUsd)}
          {over ? " · goal met" : ""}
        </div>
      </div>
      <div
        className="mt-3 h-[3px] w-full bg-rule"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={f.goalUsd}
        aria-valuenow={Math.min(f.raisedUsd, f.goalUsd)}
        aria-valuetext={`${formatUsd(f.raisedUsd)} raised, ${pct}% of goal`}
      >
        <div
          className="h-full bg-red transition-[width] duration-700"
          style={{ width: `${fill * 100}%` }}
        />
      </div>
      <div className="label mt-3 flex flex-wrap items-center justify-between gap-2">
        <span>
          {f.donors !== null ? `${f.donors} ${f.donors === 1 ? "gift" : "gifts"} · ` : ""}
          100% to {site.charity.name}
        </span>
        <span className={f.live ? "" : "!text-ink-soft/70"}>
          {f.live ? "Live from Team IMF" : "Registration opens soon"}
        </span>
      </div>
    </section>
  );
}
