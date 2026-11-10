import { formatUsd, getFundraising } from "@/lib/fundraising";
import { site } from "@/lib/site";
import { CountdownDays } from "./Countdown";

/**
 * Live total from Team IMF. Past the goal the bar stays full and the
 * percentage keeps counting, so 100%+ reads as the achievement it is.
 */
export async function FundraisingMeter({ className = "" }: { className?: string }) {
  const f = await getFundraising();
  const pct = Math.round(f.progress * 100);
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
      <Bar raised={f.raisedUsd} goal={f.goalUsd} progress={f.progress} className="mt-3 h-[3px]" />
      <div className="label mt-3 flex flex-wrap items-center justify-between gap-2">
        <span>
          {f.donors !== null ? `${f.donors} ${f.donors === 1 ? "gift" : "gifts"} · ` : ""}
          100% to {site.charity.name}
        </span>
        <span className={f.live ? "" : "!text-ink-faint"}>
          {f.live ? "Live from Team IMF" : "Registration opens soon"}
        </span>
      </div>
    </section>
  );
}

function Bar({
  raised,
  goal,
  progress,
  className,
}: {
  raised: number;
  goal: number;
  progress: number;
  className: string;
}) {
  const pct = Math.round(progress * 100);
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-rule ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={Math.min(raised, goal)}
      aria-valuetext={`${formatUsd(raised)} raised, ${pct}% of goal`}
    >
      <div
        className="h-full rounded-full bg-red transition-[width] duration-700"
        style={{ width: `${Math.min(progress, 1) * 100}%` }}
      />
    </div>
  );
}

/**
 * The top of the letter: three big figures (days to IRONMAN Texas, raised, miles),
 * a thick progress bar, and the donate button. Centered.
 */
export async function CampaignHero({ className = "" }: { className?: string }) {
  const f = await getFundraising();
  const pct = Math.round(f.progress * 100);
  const over = f.progress > 1;

  return (
    <section className={`text-center ${className}`} aria-label="Campaign at a glance">
      <dl className="grid grid-cols-3 divide-x divide-rule">
        <Figure label="Days to IRONMAN Texas">
          <CountdownDays />
        </Figure>
        <Figure label={`Raised of ${formatUsd(f.goalUsd)}`}>{formatUsd(f.raisedUsd)}</Figure>
        <Figure label="Miles on race day">{site.race.totalMiles}</Figure>
      </dl>

      <div className="mx-auto mt-5 max-w-[560px]">
        <Bar raised={f.raisedUsd} goal={f.goalUsd} progress={f.progress} className="h-2" />
        <div className="label mt-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span className="!text-red">
            {pct}%{over ? " · goal met" : " of goal"}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {f.donors !== null ? `${f.donors} ${f.donors === 1 ? "gift" : "gifts"} · ` : ""}
            100% to {site.charity.name}
          </span>
          <span aria-hidden="true">·</span>
          <span className={f.live ? "" : "!text-ink-faint"}>
            {f.live ? "Live from Team IMF" : "Registration opens soon"}
          </span>
        </div>
      </div>
    </section>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse items-center justify-end gap-2 sm:px-6">
      <dt className="label">{label}</dt>
      <dd className="num text-[2.4rem] leading-none text-red sm:text-[2.8rem]">{children}</dd>
    </div>
  );
}
