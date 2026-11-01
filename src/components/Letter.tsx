import type { CSSProperties } from "react";
import Link from "next/link";
import { site, stats } from "@/lib/site";
import { Countdown } from "./Countdown";
import { FundraisingMeter } from "./FundraisingMeter";
import { Mark } from "./marks";

/** Stagger index for the `.rise` animation. */
const step = (i: number) => ({ "--i": i }) as CSSProperties;

export function Letter() {
  return (
    <article
      className="sheet relative mx-auto w-full max-w-[1200px] px-5 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-16"
      aria-labelledby="letter-title"
    >
      <h1 id="letter-title" className="sr-only">
        {site.name}
      </h1>

      {/* letterhead */}
      <header className="rise flex flex-wrap items-end justify-between gap-4" style={step(0)}>
        <div className="flex items-center gap-3">
          <Mark className="h-9 w-9 text-red" />
          <div className="leading-none">
            <div className="font-serif text-[1.15rem] tracking-tight">{site.name}</div>
            <div className="label mt-1.5 whitespace-nowrap">
              {site.race.name}
              <span className="hidden sm:inline">
                {" "}
                · {site.race.city}, {site.race.stateAbbr}
              </span>
            </div>
          </div>
        </div>
        <div className="sm:text-right">
          <div className="label">Letter No. 01</div>
          <Countdown className="label mt-1.5 block !text-red" />
        </div>
      </header>
      <div className="rise mt-6 h-px w-full bg-red" style={step(1)} />

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-20">
        {/* the letter */}
        <div className="max-w-[620px] space-y-6 font-serif text-[1.2rem] leading-[1.6] text-ink sm:text-[1.28rem]">
          <p className="rise dropcap" style={step(2)}>
            For what little attention it gets, I was surprised to find out that
            coronary heart disease is the leading cause of death worldwide.
            What makes me the most sad on a personal level is how, more often
            than not, it is entirely preventable. Some people are more
            genetically predisposed than others, and certain factors are out
            of anyone&apos;s control. But the habits we build in childhood and
            early adulthood are the ones that not only persist, but eventually
            lead to hearts that cannot keep up.
          </p>

          <p className="rise" style={step(3)}>
            It often looks like this: plaque builds in the coronary arteries,
            causing years of hypertension and discomfort, until eventually the
            plaque dislodges, a blood clot forms, and the heart muscle is
            starved of oxygen. This breaks my heart (no pun intended),
            particularly because so often the root of it is children simply
            never being exposed to the habits that take care of their hearts,
            and their entire bodies, at all.
          </p>

          <p className="rise" style={step(4)}>
            Thus, on{" "}
            <strong className="font-semibold">{site.race.dateLabel}</strong>,
            in {site.race.city}, {site.race.state}, I will swim 1.2 miles,
            bike 56, and run 13.1 with {site.charity.team}, the charity team
            of {site.charity.name}. I am not racing to prove I am an athlete.
            I am racing to show, as plainly as I can, what a heart is capable
            of when it is cared for from the start, and to raise money for a
            foundation that puts that chance in front of young people.
          </p>

          <p className="rise" style={step(5)}>
            If you are able to give, every dollar goes to {site.charity.name}.
            And whether or not you give, I hope you will take a child you love
            outside this week and move with them. It is among the best gifts
            you can give a heart, and it costs nothing at all.
          </p>

          <p className="rise" style={step(6)}>
            Thank you for reading, and for caring about this with me.
          </p>

          <div className="rise pt-4" style={step(7)}>
            <div className="font-serif text-[1.15rem] italic text-ink-soft">
              With gratitude, and in motion,
            </div>
            <div className="font-hand mt-1 text-[2.8rem] leading-none text-red">
              Filippo
            </div>
            <div className="mt-3 font-serif text-[1rem] leading-snug text-ink">
              {site.author.name}
            </div>
            <div className="label mt-1 !normal-case !tracking-normal !text-ink-soft !text-[0.8rem]">
              {site.author.title} · {site.author.role}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {site.author.socials
                .filter((s) => !s.href.includes("REPLACE"))
                .map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="label underline decoration-rule underline-offset-4 hover:text-red"
                  >
                    {s.label} ↗
                  </a>
                ))}
            </div>
          </div>

          <div className="rise flex flex-wrap items-center gap-3 pt-6" style={step(8)}>
            <a
              href={site.donateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pill pill-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
            >
              <Mark className="h-5 w-5" />
              Give through {site.charity.team}
            </a>
            <Link href="/training" className="pill pill-ghost">
              Follow the training
            </Link>
          </div>

          <p className="rise pt-2 font-serif text-[1.02rem] italic leading-relaxed text-ink-soft" style={step(9)}>
            P.S. This page is open source. The training, the race-day splits,
            and the fundraising total will all be published here as they
            happen.
          </p>
        </div>

        {/* rail */}
        <aside className="rise lg:sticky lg:top-24 lg:self-start" style={step(4)} aria-label="Campaign figures">
          <FundraisingMeter />

          <dl className="mt-10 border-t border-rule">
            {stats.map((s, i) => (
              <div
                key={s.value + s.sourceLabel}
                className="rise grid grid-cols-[6.5rem_1fr] gap-4 border-b border-rule py-4"
                style={step(5 + i)}
              >
                <dt className="num text-[1.35rem] leading-none text-red">{s.value}</dt>
                <dd className="font-serif text-[0.95rem] leading-snug text-ink-soft">
                  {s.label}{" "}
                  <a
                    href={s.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="label whitespace-nowrap underline decoration-rule underline-offset-4 hover:text-red"
                  >
                    {s.sourceLabel} ↗
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      {/* the route, drawn to scale */}
      <section className="rise mt-16" style={step(10)} aria-label="Race distances, to scale">
        <div className="flex items-end justify-between">
          <span className="label">The route, to scale</span>
          <span className="label !text-red">{site.race.totalMiles} miles</span>
        </div>
        <div className="mt-3 flex items-start gap-1">
          {site.race.legs.map((leg) => (
            <div
              key={leg.label}
              className="relative min-w-[5.5rem] border-t-2 border-ink pt-2"
              style={{ flexGrow: leg.miles }}
            >
              <div className="label !text-ink">{leg.label}</div>
              <div className="label">{leg.miles} mi</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="rise mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5" style={step(11)}>
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
  );
}
