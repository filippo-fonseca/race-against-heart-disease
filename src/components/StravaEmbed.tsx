import Link from "next/link";
import { site } from "@/lib/site";
import { loadTraining } from "@/lib/training/load";
import { fmtHM, fmtShort, sportLabel } from "./training/format";
import { SocialIcon } from "./Socials";

/** Strava brand orange. */
const STRAVA_ORANGE = "#FC4C02";

/**
 * "Follow my journey" card in Strava orange. Reads the activities already
 * synced from Strava (webhook + cron), so it needs no Strava widget token and
 * never calls Strava from the page. Links to the athlete's Strava profile
 * once the athlete row has a strava_id (or NEXT_PUBLIC_STRAVA_ATHLETE_ID).
 */
export async function StravaEmbed({ className = "" }: { className?: string }) {
  const { athletes, activities } = await loadTraining();
  const mine = activities
    .filter((a) => a.athlete === "filippo")
    .sort((a, b) => b.startLocal.localeCompare(a.startLocal));

  const stravaId =
    athletes.find((a) => a.slug === "filippo")?.stravaId ?? site.author.strava.athleteId ?? null;
  const profileUrl = stravaId ? `https://www.strava.com/athletes/${stravaId}` : null;

  const totalSec = mine.reduce((n, a) => n + a.movingTimeSec, 0);
  const totalKm = mine.reduce((n, a) => n + a.distanceM, 0) / 1000;
  const latest = mine[0] ?? null;

  return (
    <section
      className={`mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl text-left text-white shadow-[0_18px_40px_-22px_rgba(252,76,2,0.75)] ${className}`}
      style={{ backgroundColor: STRAVA_ORANGE }}
      aria-label="Follow the journey on Strava"
    >
      <div className="flex items-center justify-between gap-4 px-5 pt-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white"
            style={{ color: STRAVA_ORANGE }}
          >
            <SocialIcon kind="strava" className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <div className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-white/80">Strava</div>
            <div className="font-serif text-[1.25rem]">Follow my journey</div>
          </div>
        </div>
        {profileUrl ? (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 shrink-0 items-center rounded-full bg-white px-4 text-[0.85rem] font-semibold transition-transform active:scale-[0.97]"
            style={{ color: STRAVA_ORANGE }}
          >
            Follow ↗
          </a>
        ) : (
          <Link
            href="/training"
            className="inline-flex h-9 shrink-0 items-center rounded-full bg-white px-4 text-[0.85rem] font-semibold"
            style={{ color: STRAVA_ORANGE }}
          >
            Training log →
          </Link>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-3 divide-x divide-white/25 border-y border-white/25">
        <Stat label="Sessions" value={mine.length.toLocaleString()} />
        <Stat label="Hours" value={fmtHM(totalSec)} />
        <Stat label="Kilometers" value={totalKm.toFixed(totalKm < 100 ? 1 : 0)} />
      </dl>

      <div className="px-5 py-4 text-[0.9rem] sm:px-6">
        {latest ? (
          <Link href="/training" className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 hover:underline">
            <span className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-white/80">Latest</span>
            <span className="font-semibold">{latest.name}</span>
            <span className="text-white/85">
              {sportLabel[latest.sport]} · {latest.distanceM > 0 ? `${(latest.distanceM / 1000).toFixed(1)} km · ` : ""}
              {fmtHM(latest.movingTimeSec)} · {fmtShort(latest.date)}
            </span>
          </Link>
        ) : (
          <p className="text-white/90">
            Every swim, ride and run lands here as it happens, from now to the start line on{" "}
            {site.race.dateLabel}.
          </p>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-3">
      <dd className="num text-[1.6rem] leading-none">{value}</dd>
      <dt className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-white/80">{label}</dt>
    </div>
  );
}
