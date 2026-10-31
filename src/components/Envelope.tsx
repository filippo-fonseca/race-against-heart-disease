"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { site } from "@/lib/site";
import { Letter } from "./Letter";
import { Postmark, Seal, Stamp } from "./marks";

type Stage = "closed" | "opening" | "open";

/** How long the flap/sheet choreography runs before we swap to the letter. */
const OPEN_MS = 1400;

export function Envelope() {
  const [stage, setStage] = useState<Stage>("closed");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback(() => {
    if (stage !== "closed") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStage("opening");
    timer.current = setTimeout(() => setStage("open"), reduce ? 50 : OPEN_MS);
  }, [stage]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (stage === "open") window.scrollTo({ top: 0, behavior: "instant" });
  }, [stage]);

  if (stage === "open") {
    return (
      <div className="px-4 py-10 sm:py-16">
        <Letter />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-72px)] items-center justify-center px-4 py-10">
      <div
        className={`envelope relative w-full max-w-[640px] ${stage === "opening" ? "is-opening" : ""}`}
      >
        {/* envelope body: back + tucked letter + front pocket */}
        <div className="envelope-body relative aspect-[5/6] w-full sm:aspect-[8/5]">
          <div className="absolute inset-0 z-0 border border-rule bg-paper" />

          <div
            aria-hidden="true"
            className="letter-sheet absolute left-[22%] top-[25%] z-10 h-[62%] w-[56%] border border-rule bg-paper shadow-[0_10px_30px_-20px_rgba(0,0,0,0.3)]"
          >
            <div className="m-[9%] space-y-2.5">
              <div className="h-1.5 w-2/3 bg-rule" />
              <div className="h-1.5 w-full bg-rule" />
              <div className="h-1.5 w-11/12 bg-rule" />
              <div className="h-1.5 w-4/5 bg-rule" />
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-20 h-[55%] border border-rule bg-paper shadow-[0_-1px_0_rgba(0,0,0,0.03)]">
            {/* return address */}
            <div className="label absolute bottom-[10%] right-[6%] text-right !text-ink-soft leading-[1.7] sm:bottom-[12%] sm:right-[5%]">
              From {site.author.name}
              <br />
              {site.race.city}, {site.race.stateAbbr}
            </div>

            {/* address block */}
            <div className="absolute bottom-[30%] left-[6%] max-w-[88%] sm:bottom-[12%] sm:max-w-[62%]">
              <div className="label mb-1">To</div>
              <div className="font-hand text-[1.7rem] leading-[1.1] text-ink sm:text-[2rem]">
                Every young heart,
                <br />
                and everyone who looks after one
              </div>
              <div className="label mt-2 hidden !text-ink-soft sm:block">
                Please open · One good reason to move enclosed
              </div>
            </div>

            {/* stamp + postmark (postmark only where there is room) */}
            <div className="absolute right-[6%] top-[-30%] flex items-start sm:right-[5%] sm:top-[-34%]">
              <Postmark className="relative z-10 -mr-[66px] mt-2 hidden w-[176px] text-ink/65 sm:block" />
              <Stamp className="rotate-[2deg]" />
            </div>
          </div>

          {/* flap */}
          <div
            className="flap absolute inset-x-0 top-0 z-30 h-[56%]"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 800 280"
              preserveAspectRatio="none"
              className="h-full w-full drop-shadow-[0_2px_3px_rgba(0,0,0,0.06)]"
            >
              <path
                d="M0 0 L800 0 L400 280 Z"
                fill="var(--paper)"
                stroke="var(--rule)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>

          {/* wax seal (the only control) */}
          <button
            type="button"
            onClick={open}
            disabled={stage !== "closed"}
            aria-label="Break the seal and open the letter"
            className="seal seal-ring group absolute left-1/2 top-[56%] z-40 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red"
          >
            <Seal className="transition-transform duration-300 group-hover:scale-[1.04] group-active:scale-[0.97]" />
          </button>
        </div>

        <p className="label mt-8 text-center">
          {stage === "closed" ? "Press the seal to open" : "Opening"}
        </p>
      </div>
    </div>
  );
}
