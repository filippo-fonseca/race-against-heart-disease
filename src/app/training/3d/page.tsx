import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Mark } from "@/components/marks";
import { SiteHeader } from "@/components/SiteHeader";
import { Skyline3D } from "@/components/training/Skyline3D";
import { loadSkylineDays } from "@/components/training/skyline-data";
import { SportPill } from "@/components/training/SportPill";
import { site } from "@/lib/site";
import { TRAINING_DAYS } from "@/lib/training/dates";
import { SPORTS } from "@/lib/training/types";

export const metadata: Metadata = {
  title: "My training in 3D",
  description: `Every day from day one to ${site.race.name} as a 3D skyline: one tower per training day, stacked by sport.`,
};

/** Builds the skyline from the cached Strava data at request time. */
async function Scene() {
  const days = await loadSkylineDays();
  return <Skyline3D days={days} variant="page" />;
}

export default function Training3DPage() {
  return (
    <>
      <SiteHeader current="training" />
      <div className="px-4 py-6 sm:px-6 sm:py-10">
        <article className="sheet relative mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-10 sm:py-12">
          <div aria-hidden="true" className="hero-aura hero-aura--compact">
            <span className="hero-aura-blob hero-aura-cool" />
            <span className="hero-aura-blob hero-aura-red" />
            <span className="hero-aura-blob hero-aura-warm" />
          </div>

          <header className="flex flex-col items-center gap-3 text-center">
            <h1 className="flex items-center justify-center gap-3 font-serif text-[2.1rem] leading-none tracking-tight sm:text-[2.7rem]">
              <Mark className="h-8 w-8 text-red sm:h-9 sm:w-9" />
              <span>
                My training, <em className="text-red">in 3D</em>
              </span>
            </h1>
            <p className="max-w-[56ch] text-balance font-serif text-[1.08rem] leading-snug text-ink-soft">
              All {TRAINING_DAYS} days, from day one on November 2 to race day in Galveston. Each column is a week and
              each row a weekday. Every training day rises as a tower, stacked by sport and as tall as the minutes
              behind it.
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              {SPORTS.map((s) => (
                <SportPill key={s} sport={s} />
              ))}
              <span className="label inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red" /> Race day
              </span>
            </div>
          </header>

          <div className="mt-6">
            <Suspense
              fallback={
                <div className="flex h-[62vh] min-h-[420px] items-center justify-center sm:h-[70vh]">
                  <span className="label">Building the skyline…</span>
                </div>
              }
            >
              <Scene />
            </Suspense>
          </div>

          <div className="mt-4 flex flex-col items-center gap-3 text-center">
            <p className="label">Drag to orbit · scroll to zoom · hover a day · click to open it in the log</p>
            <Link href="/training" className="pill pill-ghost !h-11 !px-5">
              ← Back to the training log
            </Link>
          </div>
        </article>
      </div>
    </>
  );
}
