import type { CSSProperties } from "react";
import Link from "next/link";
import { site, stats } from "@/lib/site";
import { Countdown } from "./Countdown";
import { Mark, Postmark } from "./marks";

/** Stagger index for the `.rise` animation. */
const step = (i: number) => ({ "--i": i }) as CSSProperties;

export function Letter() {
  return (
    <article
      className="sheet relative mx-auto w-full max-w-[1040px] overflow-hidden px-6 py-10 sm:px-12 sm:py-14 lg:px-16 lg:py-16"
      aria-labelledby="letter-title"
    >
      <h1 id="letter-title" className="sr-only">
        {site.name}
      </h1>

      {/* cancellation mark, as if the sheet went through the mail too */}
      <Postmark
        className="pointer-events-none absolute -right-6 top-2 hidden w-[300px] rotate-[-8deg] text-red opacity-[0.16] sm:block"
        aria-hidden="true"
      />

      {/* letterhead */}
      <header className="rise relative flex items-end justify-between gap-6" style={step(0)}>
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
      </header>
      <div className="rise mt-6 h-px w-full bg-red" style={step(1)} />

      <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_15rem] lg:gap-16">
        {/* the letter */}
        <div className="max-w-[640px] space-y-6 font-serif text-[1.2rem] leading-[1.58] text-ink sm:text-[1.28rem]">
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
            <div className="label mt-3">
              {site.author.name} ·{" "}
              <a
                href={site.author.url}
                className="underline decoration-rule underline-offset-4 hover:text-red"
              >
                filippofonseca.com
              </a>
            </div>
          </div>

          <div className="rise flex flex-col gap-3 pt-6 sm:flex-row sm:items-center" style={step(8)}>
            <a
              href={site.donateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2.5 bg-red px-6 py-3.5 font-serif text-[1.08rem] text-paper shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)] transition-colors hover:bg-red-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
            >
              <Mark className="h-5 w-5" knockout={false} />
              Give through {site.charity.team}
            </a>
            <span className="label sm:ml-2">100% to {site.charity.name}</span>
          </div>

          <p className="rise pt-2 font-serif text-[1.02rem] italic leading-relaxed text-ink-soft" style={step(9)}>
            P.S. This page is open source. The training, the race-day splits,
            and the fundraising total will all be published here as they
            happen.
          </p>
        </div>

        {/* marginalia */}
        <aside
          className="rise border-t border-rule pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-1"
          style={step(4)}
          aria-labelledby="fine-print"
        >
          <div className="flex items-baseline justify-between gap-4 lg:block">
            <h2 id="fine-print" className="label">
              Letter No. 01
            </h2>
            <Countdown className="label block !text-red lg:mt-1.5" />
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-1 lg:gap-y-9">
            {stats.map((s, i) => (
              <div key={s.value + s.sourceLabel} className="rise" style={step(5 + i)}>
                <dt className="font-serif text-[2.1rem] leading-none tracking-tight text-red">
                  {s.value}
                </dt>
                <dd className="mt-2 font-serif text-[0.98rem] leading-snug text-ink">
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
      <section className="rise mt-14" style={step(10)} aria-label="Race distances, to scale">
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
              <div className="label !text-ink-soft">{leg.miles} mi</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="rise mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5" style={step(11)}>
        <span className="label">
          Postmarked {site.race.city}, {site.race.stateAbbr} · {site.race.postmarkDate}
        </span>
        <Link
          href="/training"
          className="label underline decoration-rule underline-offset-4 hover:text-red"
        >
          The training log →
        </Link>
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
