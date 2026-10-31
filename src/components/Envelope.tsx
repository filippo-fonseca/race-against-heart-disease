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
        {/* letter sheet, tucked in the pocket */}
        <div
          aria-hidden="true"
          className="letter-sheet absolute left-[10%] top-[10%] z-10 h-[84%] w-[80%] border border-rule bg-paper shadow-[0_10px_30px_-20px_rgba(0,0,0,0.3)]"
        >
          <div className="m-[10%] space-y-3">
            <div className="h-2 w-2/3 bg-rule" />
            <div className="h-2 w-full bg-rule" />
            <div className="h-2 w-11/12 bg-rule" />
            <div className="h-2 w-4/5 bg-rule" />
          </div>
        </div>

        {/* envelope body: back + front pocket */}
        <div className="envelope-body relative aspect-[8/5] w-full">
          <div className="absolute inset-0 z-0 border border-rule bg-paper" />

          <div className="absolute inset-x-0 bottom-0 z-20 h-[55%] border border-rule bg-paper shadow-[0_-1px_0_rgba(0,0,0,0.03)]">
            {/* address block */}
            <div className="absolute bottom-[12%] left-[7%] max-w-[55%]">
              <div className="label mb-1">To</div>
              <div className="font-hand text-[1.5rem] leading-[1.1] text-ink sm:text-[2rem]">
                Whoever is sitting
                <br />
                down right now
              </div>
              <div className="label mt-2 !text-ink-soft">
                Open immediately · Contains one argument
              </div>
            </div>

            {/* stamp + postmark */}
            <div className="absolute right-[6%] top-[-28%] flex items-start">
              <Postmark className="relative z-10 -mr-[46px] mt-3 w-[180px] text-ink/70 sm:-mr-[52px] sm:w-[210px]" />
              <Stamp className="rotate-[2deg]" />
            </div>

            {/* return address */}
            <div className="label absolute bottom-[12%] right-[7%] text-right !text-ink-soft">
              From {site.author.name}
              <br />
              {site.race.city}, {site.race.stateAbbr} · {site.race.postmarkDate}
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
