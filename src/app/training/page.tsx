import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { Mark } from "@/components/marks";
import { AthleteToggle } from "@/components/training/AthleteToggle";
import { ChartRail } from "@/components/training/ChartRail";
import { Log } from "@/components/training/Log";
import { Numerals } from "@/components/training/Numerals";
import { ScrollSpy } from "@/components/training/ScrollSpy";
import { buildWeekSlots, groupByWeek, minutesByDate, type AthleteFilter } from "@/components/training/model";
import { site } from "@/lib/site";
import type { Activity, Athlete, PlanSession } from "@/lib/training/types";
/*
 * Data source. Everything below this comment is the only thing that changes
 * when the real layers land:
 *   import { getAthletes, getActivities } from "@/lib/training/queries";
 *   import { getPlan } from "@/lib/training/plan";
 *   import { matchDays } from "@/lib/training/matcher";
 *   import { weeklyTotals, summarize } from "@/lib/training/aggregate";
 * and `today` becomes the athlete-local calendar day.
 */
import {
  MOCK_TODAY,
  PROGRAM_START,
  PROGRAM_WEEKS,
  RACE_DAY,
  addDays,
  daysBetween,
  matchDays,
  mockActivities,
  mockAthletes,
  mockPlan,
  phaseForWeek,
  summarize,
  weekNumberOf,
  weekStartOf,
  weeklyTotals,
} from "@/lib/training/mock";
import "./training.css";

export const metadata: Metadata = {
  title: "The training",
  description: `A daily log of the build toward ${site.race.name}: every planned session, what actually happened, and the charts that keep it honest.`,
};

const step = (i: number) => ({ "--i": i }) as CSSProperties;

async function loadTraining(filter: AthleteFilter) {
  const today = MOCK_TODAY;
  const allAthletes: Athlete[] = mockAthletes;
  const plan: PlanSession[] = mockPlan;
  const selected = allAthletes.filter((a) => filter === "both" || a.slug === filter);
  const activities: Activity[] = mockActivities.filter((a) => selected.some((s) => s.slug === a.athlete));

  // Show the whole current week so upcoming sessions sit at the top of the log.
  const endOfWeek = addDays(weekStartOf(today), 6);
  const until = endOfWeek < RACE_DAY ? endOfWeek : RACE_DAY;

  const matches = selected.flatMap((a) => matchDays(plan, activities, a.slug, today, until));
  const weekly = selected.flatMap((a) => weeklyTotals(matches.filter((m) => m.athlete === a.slug)));
  const summaries = selected.map((a) => summarize(activities, a.slug, today));

  return { today, allAthletes, selected, plan, activities, matches, weekly, summaries };
}

function parseFilter(v: string | string[] | undefined): AthleteFilter {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "filippo" || s === "amir" ? s : "both";
}

function Header({ athletes, selected }: { athletes: Athlete[]; selected: AthleteFilter | null }) {
  return (
    <>
      <header className="rise flex flex-wrap items-end justify-between gap-x-8 gap-y-4" style={step(0)}>
        <div>
          <Link href="/" className="label underline decoration-rule underline-offset-4 hover:text-red">
            ← Back to the letter
          </Link>
          <h1 className="mt-4 flex items-center gap-3 font-serif text-[2.4rem] leading-none tracking-tight sm:text-[3rem]">
            <Mark className="h-8 w-8 text-red sm:h-9 sm:w-9" />
            The training
          </h1>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className="label">
            {site.race.name} · {site.race.dateLabel}
          </span>
          {selected ? <AthleteToggle athletes={athletes} selected={selected} /> : <span className="label">&nbsp;</span>}
        </div>
      </header>
      <div className="rise mt-6 h-px w-full bg-red" style={step(1)} />
    </>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filter = parseFilter((await searchParams).athlete);
  const data = await loadTraining(filter);
  const { today, allAthletes, selected, plan, activities, matches, weekly, summaries } = data;

  const currentWeek = weekNumberOf(today);
  const slots = buildWeekSlots(plan, weekly, PROGRAM_WEEKS, (w) => addDays(PROGRAM_START, (w - 1) * 7), selected.length);
  const weeks = groupByWeek(matches, weekNumberOf, weekStartOf, phaseForWeek, selected.length);

  return (
    <>
      <Header athletes={allAthletes} selected={filter} />

      <div className="mt-10">
        <Numerals summaries={summaries} daysToRace={daysBetween(today, RACE_DAY)} />
      </div>

      <p className="rise mt-8 max-w-[640px] font-serif text-[1.15rem] leading-[1.55] text-ink" style={step(2)}>
        Every session since {new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${PROGRAM_START}T00:00:00Z`))},
        pulled from Strava as it happens and set against the program. {selected.length > 1 ? `${selected.map((a) => a.name).join(" and ")} train together.` : `${selected[0]?.name ?? ""} is training with ${allAthletes.find((a) => a.slug !== selected[0]?.slug)?.name ?? "a partner"}.`}{" "}
        The charts follow the week you are reading.
      </p>

      <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-16">
        <div className="lg:order-last">
          <ChartRail
            cal={{
              start: PROGRAM_START,
              raceDay: RACE_DAY,
              today,
              totalWeeks: PROGRAM_WEEKS,
              totalDays: daysBetween(PROGRAM_START, RACE_DAY),
              currentWeek,
              addDays,
              daysBetween,
              weekNumberOf,
            }}
            minutes={minutesByDate(matches)}
            slots={slots}
            activities={activities}
          />
        </div>
        <div id="training-log">
          <Log weeks={weeks} athletes={allAthletes} today={today} showAthlete={selected.length > 1} />
        </div>
      </div>

      <ScrollSpy rootId="training-root" />
    </>
  );
}

export default function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div id="training-root" className="training px-4 py-6 sm:px-8 sm:py-12">
      <article className="sheet relative mx-auto w-full max-w-[1200px] px-6 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-16">
        <Suspense fallback={<Header athletes={mockAthletes} selected={null} />}>
          <Body searchParams={searchParams} />
        </Suspense>
        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
          <span className="label">
            Postmarked {site.race.city}, {site.race.stateAbbr} · {site.race.postmarkDate}
          </span>
          <Link href="/" className="label underline decoration-rule underline-offset-4 hover:text-red">
            The letter
          </Link>
        </footer>
      </article>
    </div>
  );
}
