import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { site } from "@/lib/site";
import { totalsBySport } from "@/lib/training/aggregate";
import { TRAINING_DAYS, TRAINING_START, dayNumber, todayISO, weeksElapsed } from "@/lib/training/dates";
import { loadTraining, resolveAthlete } from "@/lib/training/load";
import { SPORTS } from "@/lib/training/types";
import { fmtHM, fmtHours, fmtKm, fmtSportTotal } from "./training/format";
import { SportPill } from "./training/SportPill";
import { SocialIcon } from "./Socials";

/** Strava brand orange. */
const STRAVA_ORANGE = "#FC4C02";

/**
 * "Follow my journey" card in Strava orange. Reads the activities already
 * synced from Strava (webhook + cron) for the training window, so it needs no
 * Strava widget token and never calls Strava from the page. Links to the
 * athlete's Strava profile once the athlete row has a strava_id (or
 * NEXT_PUBLIC_STRAVA_ATHLETE_ID).
 */
export async function StravaEmbed({ className = "" }: { className?: string }) {
  const { athletes, activities } = await loadTraining();
  const mine = activities.slice().sort((a, b) => b.startLocal.localeCompare(a.startLocal));

  const stravaId = resolveAthlete(athletes).stravaId ?? site.author.strava.athleteId ?? null;
  const profileUrl = stravaId ? `https://www.strava.com/athletes/${stravaId}` : null;

  const totalSec = mine.reduce((n, a) => n + a.movingTimeSec, 0);
  const bySport = totalsBySport(mine);
  const latest = mine[0] ?? null;
  const thumb = latest?.photos[0] ?? null;

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
            <div className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-white">Strava</div>
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

      <dl className="mt-5 grid grid-cols-4 divide-x divide-white/25 border-t border-white/25">
        <Stat label="Sessions" value={mine.length.toLocaleString()} />
        <Stat label="Hours" value={`${fmtHours(totalSec)}h`} />
        <Suspense
          fallback={
            <>
              <Stat label="Avg / week" value="–" />
              <Stat label={`of ${TRAINING_DAYS}`} value="Day" />
            </>
          }
        >
          <TodayStats totalSec={totalSec} />
        </Suspense>
      </dl>

      {/* Per sport, by the site's rule: swim and run by distance, bike and lift by time. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-y border-white/25 px-5 py-3.5 sm:grid-cols-4 sm:px-6">
        {SPORTS.map((s) => (
          <div key={s} className="flex items-center gap-2">
            <dt>
              <SportPill sport={s} onColor />
            </dt>
            <dd className="num text-[0.95rem] leading-none text-white">{fmtSportTotal(s, bySport[s])}</dd>
          </div>
        ))}
      </dl>

      <div className="px-5 py-4 text-[0.92rem] sm:px-6">
        {latest ? (
          <Link href="/training" className="group flex items-center gap-3">
            {thumb ? (
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/20 ring-1 ring-white">
                <Image src={thumb.url} alt={thumb.caption ?? `${latest.name}, photo`} fill sizes="48px" className="object-cover" />
              </span>
            ) : null}
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-white">Latest</span>
              <SportPill sport={latest.sport} onColor />
              <span className="font-semibold group-hover:underline">{latest.name}</span>
              <span className="text-white">
                {fmtHM(latest.movingTimeSec)}
                {latest.distanceM > 0 ? ` · ${fmtKm(latest.distanceM, latest.sport)} km` : ""} · Day {dayNumber(latest.date)}
              </span>
            </span>
          </Link>
        ) : (
          <p className="text-white">
            Every swim, ride, run and lift lands here as it happens, from day one on November 2 to the start line on{" "}
            {site.race.dateLabel}.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Average hours per week so far, and "Day 8 of 154". Both read today's date,
 * so they render at request time.
 */
async function TodayStats({ totalSec }: { totalSec: number }) {
  await connection();
  const today = todayISO();
  const n = today < TRAINING_START ? 0 : Math.min(dayNumber(today), TRAINING_DAYS);
  const weeks = weeksElapsed(today);
  return (
    <>
      <Stat label="Avg / week" value={`${fmtHours(weeks > 0 ? totalSec / weeks : 0)}h`} />
      <Stat label={`of ${TRAINING_DAYS}`} value={`Day ${n}`} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse items-center gap-1 py-3">
      <dt className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-white sm:text-[0.68rem] sm:tracking-[0.16em]">{label}</dt>
      <dd className="num whitespace-nowrap text-[1.3rem] leading-none sm:text-[1.6rem]">{value}</dd>
    </div>
  );
}
