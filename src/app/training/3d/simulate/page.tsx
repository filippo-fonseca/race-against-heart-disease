import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { buildSkyline } from "@/components/training/skyline";
import { Skyline3D } from "@/components/training/Skyline3D";
import { RACE_DAY, TRAINING_DAYS, TRAINING_START, addDays } from "@/lib/training/dates";
import { mockBlock } from "@/lib/training/mock";

export const metadata: Metadata = {
  title: "Skyline simulation",
  description: "The 3D training skyline with a full block of mock data, to preview how it looks as the days add up.",
  robots: { index: false, follow: false },
};

/** Points in the block to preview. */
const STOPS = [14, 45, 90, 120, TRAINING_DAYS];

type SearchParams = Record<string, string | string[] | undefined>;

async function Scene({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const raw = (await searchParams).day;
  const n = Number.parseInt(Array.isArray(raw) ? raw[0] : (raw ?? ""), 10);
  const day = Number.isFinite(n) ? Math.min(TRAINING_DAYS, Math.max(1, n)) : TRAINING_DAYS;
  const today = addDays(TRAINING_START, day - 1);
  const activities = mockBlock(today, RACE_DAY);
  const days = buildSkyline({ activities, start: TRAINING_START, totalDays: TRAINING_DAYS, today, links: new Map() });
  return (
    <>
      <nav className="flex flex-wrap items-center justify-center gap-2" aria-label="Simulate a day">
        {STOPS.map((s) => (
          <Link
            key={s}
            href={`/training/3d/simulate?day=${s}`}
            className={`pill !h-9 !px-4 !text-[0.9rem] ${s === day ? "bg-ink text-paper" : "pill-ghost"}`}
          >
            {s === TRAINING_DAYS ? "Race day" : `Day ${s}`}
          </Link>
        ))}
      </nav>
      <div className="mt-4">
        <Skyline3D key={day} days={days} variant="hero" />
      </div>
    </>
  );
}

/**
 * A preview of the training skyline with a full block of mock data (not
 * real training). Pick a point in the block to see how dense it gets. Hidden
 * from search engines.
 */
export default function SkylineSimulationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <>
      <SiteHeader current="training" />
      <div className="px-4 py-6 sm:px-6 sm:py-10">
        <article className="sheet relative mx-auto w-full max-w-[960px] px-5 py-8 sm:px-12 sm:py-10 lg:px-16">
          <header className="text-center">
            <div className="label !text-red">Simulation · mock data</div>
            <h1 className="mt-2 font-serif text-[1.8rem] font-medium leading-tight tracking-tight sm:text-[2.3rem]">
              My method? Stacking days, <em className="text-red">literally</em> :)
            </h1>
            <p className="mx-auto mt-2 max-w-[52ch] font-serif text-[1rem] leading-snug text-ink-soft">
              A made-up training block that builds week on week, with lighter weeks, a taper and the race on April 4,
              to preview the skyline as the days add up. None of this is real training.
            </p>
          </header>
          <div className="-mx-5 mt-6 sm:-mx-12 lg:-mx-16">
            <Suspense fallback={<div className="h-[520px]" />}>
              <Scene searchParams={searchParams} />
            </Suspense>
          </div>
        </article>
      </div>
    </>
  );
}
