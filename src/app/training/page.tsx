import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type CSSProperties } from "react";
import { Mark } from "@/components/marks";
import { SiteHeader } from "@/components/SiteHeader";
import { ChartRail } from "@/components/training/ChartRail";
import { DayJump } from "@/components/training/DayJump";
import { Log } from "@/components/training/Log";
import { Numerals } from "@/components/training/Numerals";
import { ScrollSpy } from "@/components/training/ScrollSpy";
import { FEED_PAGE_WEEKS, buildFeed, buildWeekSlots, dayLinks, feedWeeksShown, minutesByDate } from "@/components/training/model";
import { site } from "@/lib/site";
import { summary, weeklyTotals } from "@/lib/training/aggregate";
import {
  RACE_DAY,
  TRAINING_DAYS,
  TRAINING_START,
  TRAINING_WEEKS,
  addDays,
  dayNumber,
  daysBetween,
  daysToRace,
  inWindow,
  todayISO,
  weekNumber,
} from "@/lib/training/dates";
import { loadTraining } from "@/lib/training/load";
import type { Activity } from "@/lib/training/types";
import "./training.css";

export const metadata: Metadata = {
  title: "The training",
  description: `Every swim, ride, run and lift on the way to ${site.race.name}, synced from Strava, with the charts that add it up.`,
};

const step = (i: number) => ({ "--i": i }) as CSSProperties;

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Real data from Supabase (cached, tagged; see lib/training/load.ts). The
 * deterministic fixtures are reachable only with `?mock=1` outside production.
 */
async function loadSource(useMock: boolean): Promise<{ activities: Activity[]; today: string }> {
  if (useMock && process.env.NODE_ENV !== "production") {
    const mock = await import("@/lib/training/mock");
    return { activities: mock.mockActivities(), today: mock.MOCK_TODAY };
  }
  // Today's date is request-time data; tell the prerenderer so before reading the clock.
  await connection();
  const data = await loadTraining();
  return { activities: data.activities, today: todayISO() };
}

/** "Day 8 of 154", clamped to the window. */
function dayLabel(today: string): string {
  if (today < TRAINING_START) return "Day 1 is Nov 2";
  return `Day ${Math.min(dayNumber(today), TRAINING_DAYS)} of ${TRAINING_DAYS}`;
}

function Header({ today }: { today: string | null }) {
  return (
    <>
      <header className="rise flex flex-wrap items-end justify-between gap-x-8 gap-y-4" style={step(0)}>
        <div>
          <h1 className="flex items-center gap-3 font-serif text-[2.2rem] leading-none tracking-tight sm:text-[2.8rem]">
            <Mark className="h-8 w-8 text-red sm:h-9 sm:w-9" />
            The training
          </h1>
          <div className="label mt-3">
            {site.race.name} · {site.race.dateLabel}
          </div>
        </div>
        <span className="label !text-ink">{today ? dayLabel(today) : " "}</span>
      </header>
      <div className="rise mt-6 h-px w-full bg-red" style={step(1)} />
    </>
  );
}

async function Body({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const useMock = first(params.mock) === "1";
  const { activities: all, today } = await loadSource(useMock);

  // Retroactive only: what Strava logged inside the window, through today.
  const activities = all.filter((a) => inWindow(a.date) && a.date <= today);
  const currentWeek = weekNumber(today);
  const slots = buildWeekSlots(weeklyTotals(activities, { from: TRAINING_START, to: RACE_DAY }));
  const weeks = buildFeed(activities);
  // The feed renders the newest weeks first and grows a page at a time via ?weeks=N.
  const shown = feedWeeksShown(first(params.weeks), weeks.length);
  const hrefFor = (n: number) => {
    const q = new URLSearchParams();
    if (useMock) q.set("mock", "1");
    if (n > FEED_PAGE_WEEKS) q.set("weeks", String(n));
    const qs = q.toString();
    return qs ? `/training?${qs}` : "/training";
  };
  const links = dayLinks(weeks, shown, hrefFor);
  const totals = summary(activities, TRAINING_START, today);

  return (
    <>
      <Header today={today} />

      <div className="mt-10">
        <Numerals summary={totals} daysToRace={Math.max(0, daysToRace(today))} />
      </div>

      <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-16">
        <div className="lg:order-last">
          <ChartRail
            cal={{
              start: TRAINING_START,
              raceDay: RACE_DAY,
              today,
              totalWeeks: TRAINING_WEEKS,
              totalDays: TRAINING_DAYS - 1,
              currentWeek,
              addDays,
              daysBetween,
              weekNumberOf: weekNumber,
            }}
            minutes={minutesByDate(activities)}
            links={links}
            slots={slots}
            activities={activities}
          />
        </div>
        <div id="training-log">
          {weeks.length > 0 ? (
            <>
              <Log weeks={weeks.slice(0, shown)} today={today} />
              {shown < weeks.length ? (
                <div className="mt-12 flex flex-col items-center gap-2">
                  <Link
                    href={hrefFor(Math.min(weeks.length, shown + FEED_PAGE_WEEKS))}
                    scroll={false}
                    className="inline-flex h-10 items-center rounded-full border border-ink px-5 text-[0.9rem] font-semibold text-ink transition-colors hover:bg-ink hover:text-paper"
                  >
                    Show earlier weeks
                  </Link>
                  <span className="label">
                    {weeks.length - shown} more {weeks.length - shown === 1 ? "week" : "weeks"}
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <p className="rise font-serif text-[1.15rem] text-ink-soft" style={step(4)}>
              {today < TRAINING_START
                ? "Day one is November 2. The first session shows up here as soon as it hits Strava."
                : "Nothing logged yet. The first session shows up here as soon as it hits Strava."}
            </p>
          )}
        </div>
      </div>

      <ScrollSpy rootId="training-root" />
      <DayJump rootId="training-root" />
    </>
  );
}

export default function TrainingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <>
      <SiteHeader current="training" />
      <div id="training-root" className="training px-4 py-6 sm:px-6 sm:py-10">
        <article className="sheet relative mx-auto w-full max-w-[1200px] px-0 py-4 sm:px-12 sm:py-14 lg:px-16 lg:py-16">
          <Suspense fallback={<Header today={null} />}>
            <Body searchParams={searchParams} />
          </Suspense>
          <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
            <span className="label">
              Postmarked {site.race.city}, {site.race.stateAbbr} · {site.race.postmarkDate}
            </span>
            <a
              href={site.repo}
              target="_blank"
              rel="noopener noreferrer"
              className="label underline decoration-rule underline-offset-4 hover:text-red"
            >
              Source on GitHub ↗
            </a>
          </footer>
        </article>
      </div>
    </>
  );
}
