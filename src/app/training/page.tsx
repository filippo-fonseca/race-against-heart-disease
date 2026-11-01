import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type CSSProperties } from "react";
import { Mark } from "@/components/marks";
import { AthleteToggle } from "@/components/training/AthleteToggle";
import { ChartRail } from "@/components/training/ChartRail";
import { Log } from "@/components/training/Log";
import { Numerals } from "@/components/training/Numerals";
import { ScrollSpy } from "@/components/training/ScrollSpy";
import { buildWeekSlots, groupByWeek, minutesByDate, type AthleteFilter } from "@/components/training/model";
import { site } from "@/lib/site";
import { summary, weeklyTotals } from "@/lib/training/aggregate";
import { addDays, daysBetween, todayISO, weekStartOf } from "@/lib/training/dates";
import { DEFAULT_ATHLETES, loadTraining, resolveAthletes, type TrainingData } from "@/lib/training/load";
import { buildMatches } from "@/lib/training/matcher";
import { PLAN_START, PLAN_WEEKS, RACE_DATE, appliesTo, daysToRace, getPlan, phaseForWeek, weekOf, weekStart } from "@/lib/training/plan";
import type { Activity, Athlete } from "@/lib/training/types";
import "./training.css";

export const metadata: Metadata = {
  title: "The training",
  description: `A daily log of the build toward ${site.race.name}: every planned session, what actually happened, and the charts that keep it honest.`,
};

const step = (i: number) => ({ "--i": i }) as CSSProperties;

const weekNumberOf = (date: string) => weekOf(date).week;

const longDate = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
const fmtLong = (iso: string) => longDate.format(new Date(`${iso}T00:00:00Z`));

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseFilter(v: string | string[] | undefined): AthleteFilter {
  const s = first(v);
  return s === "filippo" || s === "amir" ? s : "both";
}

/**
 * Real data from Supabase (cached, tagged; see lib/training/load.ts). The
 * deterministic fixtures are reachable only with `?mock=1` outside production.
 */
async function loadSource(useMock: boolean): Promise<{ data: TrainingData; today: string }> {
  if (useMock && process.env.NODE_ENV !== "production") {
    const mock = await import("@/lib/training/mock");
    return {
      data: { athletes: mock.mockAthletes, activities: mock.mockActivities(), error: null },
      today: mock.MOCK_TODAY,
    };
  }
  // Today's date is request-time data; tell the prerenderer so before reading the clock.
  await connection();
  return { data: await loadTraining(), today: todayISO() };
}

async function loadTrainingView(filter: AthleteFilter, useMock: boolean) {
  const { data, today } = await loadSource(useMock);
  const plan = getPlan();
  const allAthletes = resolveAthletes(data.athletes);
  const selected = allAthletes.filter((a) => filter === "both" || a.slug === filter);
  const activities: Activity[] = data.activities.filter((a) => selected.some((s) => s.slug === a.athlete));

  // The log runs from day one through the end of the current week, so upcoming
  // sessions sit at the top. Before the program starts it shows week one.
  const endOfWeek = addDays(weekStartOf(today), 6);
  const firstWeekEnd = addDays(PLAN_START, 6);
  const untilRaw = endOfWeek > firstWeekEnd ? endOfWeek : firstWeekEnd;
  const until = untilRaw < RACE_DATE ? untilRaw : RACE_DATE;

  const matches = selected.flatMap((a) => buildMatches({ from: PLAN_START, to: until }, a.slug, plan, activities, today));
  const weekly = selected.flatMap((a) => weeklyTotals(activities, plan, a.slug, { from: PLAN_START, to: RACE_DATE }));
  const summaries = selected.map((a) => summary(activities, a.slug, PLAN_START, today));

  // "First session logs on November 3." while nothing has been logged yet.
  let emptyNote: string | null = null;
  if (activities.length === 0) {
    const next = plan.find((s) => s.date >= today && selected.some((a) => appliesTo(s, a.slug)));
    emptyNote = next ? `First session logs on ${fmtLong(next.date)}.` : "Nothing logged yet.";
  }

  return { today, allAthletes, selected, plan, activities, matches, weekly, summaries, emptyNote };
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

async function Body({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filter = parseFilter(params.athlete);
  const useMock = first(params.mock) === "1";
  const { today, allAthletes, selected, plan, activities, matches, weekly, summaries, emptyNote } = await loadTrainingView(filter, useMock);

  const currentWeek = weekNumberOf(today);
  const slots = buildWeekSlots(plan, weekly, PLAN_WEEKS, weekStart, selected.length);
  const weeks = groupByWeek(matches, weekNumberOf, weekStartOf, phaseForWeek, selected.length);

  return (
    <>
      <Header athletes={allAthletes} selected={filter} />

      <div className="mt-10">
        <Numerals summaries={summaries} daysToRace={daysToRace(today)} />
      </div>

      <p className="rise mt-8 max-w-[640px] font-serif text-[1.15rem] leading-[1.55] text-ink" style={step(2)}>
        Every session since {fmtLong(PLAN_START)}, pulled from Strava as it happens and set against the program.{" "}
        {selected.length > 1 ? `${selected.map((a) => a.name).join(" and ")} train together.` : `${selected[0]?.name ?? ""} is training with ${allAthletes.find((a) => a.slug !== selected[0]?.slug)?.name ?? "a partner"}.`}{" "}
        The charts follow the week you are reading.
      </p>
      {emptyNote ? (
        <p className="rise mt-3 label" style={step(2)}>
          {emptyNote}
        </p>
      ) : null}

      <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-16">
        <div className="lg:order-last">
          <ChartRail
            cal={{
              start: PLAN_START,
              raceDay: RACE_DATE,
              today,
              totalWeeks: PLAN_WEEKS,
              totalDays: daysBetween(PLAN_START, RACE_DATE),
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

export default function TrainingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <div id="training-root" className="training px-4 py-6 sm:px-8 sm:py-12">
      <article className="sheet relative mx-auto w-full max-w-[1200px] px-6 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-16">
        <Suspense fallback={<Header athletes={DEFAULT_ATHLETES} selected={null} />}>
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
