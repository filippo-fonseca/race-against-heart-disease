import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { site } from "@/lib/site";
import { totalsBySport } from "@/lib/training/aggregate";
import { TRAINING_DAYS, TRAINING_START, dayNumber, todayISO, weeksElapsed } from "@/lib/training/dates";
import { loadTraining, resolveAthlete } from "@/lib/training/load";
import { SPORTS } from "@/lib/training/types";
import { fmtAgo, fmtHM, fmtHours, fmtKm, fmtSportTotal } from "./training/format";
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
      className={`strava-card relative mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl bg-paper text-left ${className}`}
      aria-label="Follow the journey on Strava"
    >
      {/* Strava orange is the card's one accent: a soft glow in the corner, the badge, and the Follow button. */}
      <div aria-hidden="true" className="strava-glow" />

      <div className="relative flex items-center justify-between gap-4 px-5 pt-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-[0_6px_16px_-6px_rgba(252,76,2,0.7)]"
            style={{ backgroundColor: STRAVA_ORANGE }}
          >
            <SocialIcon kind="strava" className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <div className="label !text-[0.7rem] !tracking-[0.16em]" style={{ color: STRAVA_ORANGE }}>
              Strava
            </div>
            <div className="font-serif text-[1.25rem] text-ink">Follow my journey</div>
          </div>
        </div>
        {profileUrl ? (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="strava-follow inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[0.85rem] font-semibold text-white"
          >
            Follow ↗
          </a>
        ) : (
          <Link
            href="/training"
            className="strava-follow inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[0.85rem] font-semibold text-white"
          >
            Training log →
          </Link>
        )}
      </div>

      <dl className="relative mt-5 grid grid-cols-4 divide-x divide-rule border-y border-rule">
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
      {/* Same four columns as the stats above, so each sport sits centered under one of them. */}
      <dl className="relative grid grid-cols-2 gap-y-3 border-b border-rule py-4 sm:grid-cols-4">
        {SPORTS.map((s) => (
          <div key={s} className="flex items-center justify-center gap-2">
            <dt className="flex">
              <SportPill sport={s} />
            </dt>
            <dd className="num whitespace-nowrap text-[0.95rem] leading-none text-ink">{fmtSportTotal(s, bySport[s])}</dd>
          </div>
        ))}
      </dl>

      <div className="relative p-3 sm:p-4">
        {latest ? (
          <Link
            href="/training"
            className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-desk sm:px-3"
          >
            {thumb ? (
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-desk ring-1 ring-rule">
                <Image src={thumb.url} alt={thumb.caption ?? `${latest.name}, photo`} fill sizes="48px" className="object-cover" />
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="label !text-[0.7rem] !tracking-[0.14em]" style={{ color: STRAVA_ORANGE }}>
                  Latest
                </span>
                <SportPill sport={latest.sport} />
                <Suspense fallback={null}>
                  <Ago iso={latest.startLocal} />
                </Suspense>
              </span>
              <span className="mt-1 block font-serif text-[1.02rem] font-semibold leading-snug text-ink group-hover:underline">
                {latest.name}
              </span>
              <span className="label mt-1 block !normal-case !tracking-[0.02em]">
                {fmtHM(latest.movingTimeSec)}
                {latest.distanceM > 0 ? ` · ${fmtKm(latest.distanceM, latest.sport)} km` : ""} · Day {dayNumber(latest.date)}
              </span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        ) : (
          <p className="px-2 py-1 font-serif text-ink-soft">
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

/** "3h ago" for the latest activity. Reads the clock, so it renders at request time. */
async function Ago({ iso }: { iso: string }) {
  await connection();
  const ago = fmtAgo(iso);
  return ago ? (
    <time dateTime={iso} className="label !text-[0.7rem] !normal-case !tracking-[0.02em]">
      · {ago}
    </time>
  ) : null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse items-center gap-1.5 px-1 py-3.5">
      <dt className="label !text-[0.68rem] sm:!text-[0.75rem]">{label}</dt>
      <dd className="num whitespace-nowrap text-[1.3rem] leading-none text-ink sm:text-[1.6rem]">{value}</dd>
    </div>
  );
}
