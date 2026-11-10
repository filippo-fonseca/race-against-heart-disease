import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { site, stats } from "@/lib/site";
import { AboutLink } from "./AboutLink";
import { CampaignHero } from "./FundraisingMeter";
import { Mark } from "./marks";
import { Postcards } from "./Postcards";
import { SocialIcon, SocialRow, liveSocials } from "./Socials";
import { StravaEmbed } from "./StravaEmbed";

/** Stagger index for the `.rise` animation. */
const step = (i: number) => ({ "--i": i }) as CSSProperties;

export function Letter() {
  return (
    <article
      className="sheet relative mx-auto w-full max-w-[960px] px-5 py-8 sm:px-12 sm:py-10 lg:px-16 lg:py-12"
      aria-labelledby="letter-title"
    >
      {/* letterhead */}
      <header className="rise flex flex-col items-center gap-2 text-center" style={step(0)}>
        <Mark className="beat h-12 w-12 text-red sm:h-14 sm:w-14" />
        <div className="font-serif text-[1.25rem] leading-none tracking-tight sm:text-[1.4rem]">{site.name}</div>
        <div className="label mt-1">
          {site.race.name} · {site.race.city}, {site.race.stateAbbr} · {site.race.dateLabel}
        </div>
      </header>

      {/* what this is, in one line */}
      <h1
        id="letter-title"
        className="rise mx-auto mt-5 max-w-[24ch] text-balance text-center font-serif text-[1.9rem] font-medium leading-[1.1] tracking-tight text-ink sm:max-w-[42ch] sm:text-[2.5rem]"
        style={step(1)}
      >
        I have joined Team{" "}
        {/* The wordmark in place of the word: letters sit on the baseline at about cap height. */}
        <Image
          src="/ironman-logo.png"
          alt="IRONMAN"
          width={960}
          height={238}
          className="inline-block h-[1.08em] w-auto align-baseline"
          priority
        />{" "}
        Foundation to help fight{" "}
        <span className="text-red">heart disease in youth.</span>
      </h1>
      <p
        className="rise mx-auto mt-3 max-w-[60ch] text-balance text-center font-serif text-[1.15rem] leading-snug text-ink-soft sm:text-[1.3rem]"
        style={step(1)}
      >
        In April, I will be <strong className="font-semibold text-ink">racing {site.race.name}</strong> and need your support :)
      </p>

      {/* byline */}
      <div className="rise mt-5 flex flex-col items-center gap-3.5 text-center sm:flex-row sm:justify-center sm:gap-4 sm:text-left" style={step(1)}>
        <Image
          src={site.author.avatar}
          alt={site.author.name}
          width={192}
          height={192}
          className="h-20 w-20 rounded-full border border-rule bg-paper object-cover shadow-[0_6px_18px_-8px_rgba(20,20,20,0.35)] sm:h-24 sm:w-24"
          priority
        />
        <div className="leading-tight">
          <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 sm:justify-start">
            <span className="font-serif text-[1.15rem] font-bold text-ink">
              {site.author.name}, Age {site.author.age}
            </span>
            <AboutLink />
          </div>
          <div className="mt-1 max-w-[34ch] font-serif text-[1rem] italic text-ink-soft sm:max-w-none">
            <span className="mr-1.5 not-italic" aria-hidden="true">🫀</span>
            {site.author.bio}
          </div>
        </div>
      </div>
      <SocialRow className="rise mt-2.5" size="sm" />

      {/* the ask, first */}
      <CampaignHero className="rise mt-6" />
      <div className="rise mt-5 flex flex-col items-center gap-2.5" style={step(1)}>
        <a
          href={site.donateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pill pill-red !h-14 !gap-3 !px-8 !text-[1.25rem] shadow-[0_12px_30px_-14px_rgba(196,30,58,0.6)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
        >
          <Mark className="h-5 w-5" />
          Donate through {site.charity.team}
        </a>
        <Link href="/training" className="label underline decoration-rule underline-offset-4 hover:text-red">
          Follow the training →
        </Link>
      </div>
      <StravaEmbed className="rise mt-8" />

      <div className="rise mx-auto mt-14 h-px w-full bg-red" style={step(2)} />

      <div className="mt-14">
        {/* the letter */}
        <div className="mx-auto max-w-[640px] space-y-6 text-justify font-serif text-[1.2rem] leading-[1.6] text-ink hyphens-auto sm:text-[1.28rem]">
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
            And whether or not you give, I hope you will take a child you love (or yourself)
            outside this week and move with them. It is among the best gifts
            you can give a heart, and it costs nothing at all.
          </p>

          <p className="rise" style={step(6)}>
            Thank you for reading, and for caring about this with me.
          </p>

          <div className="rise pt-4 text-center" style={step(7)}>
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
            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
              {liveSocials().map((s) => (
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

          <div className="rise flex flex-wrap items-center justify-center gap-3 pt-6" style={step(8)}>
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

          <p className="rise pt-2 text-center font-serif text-[1.02rem] italic leading-relaxed text-ink-soft" style={step(9)}>
            P.S. This page is open source. The training, the race-day splits,
            and the fundraising total will all be published here as they
            happen.
          </p>
        </div>

      </div>

      {/* who is writing: the about text beside photo postcards */}
      <Postcards className="rise mt-20" />

      {/* the figures behind the argument */}
      <section className="rise mt-20" style={step(10)} aria-label="Campaign figures">
        <div className="label text-center">Why it matters</div>
        <dl className="mt-8 flex flex-wrap justify-center gap-y-10">
          {stats.map((s) => (
            <div
              key={s.value + s.sourceLabel}
              className="flex w-full flex-col items-center px-6 text-center sm:w-1/2 lg:w-1/3"
            >
              <dt className="num text-[2.6rem] leading-none text-red">{s.value}</dt>
              <dd className="mt-3 max-w-[18rem] font-serif text-[1rem] leading-snug text-ink-soft">
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
      </section>

      {/* the route, drawn to scale */}
      <section className="rise mx-auto mt-20 max-w-[720px]" style={step(11)} aria-label="Race distances, to scale">
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

      <footer className="rise mt-16 flex flex-col items-center gap-3 border-t border-rule pt-6 text-center sm:flex-row sm:justify-between" style={step(12)}>
        <span className="label">
          Postmarked {site.race.city}, {site.race.stateAbbr} · {site.race.postmarkDate}
        </span>
        <a
          href={site.repo}
          target="_blank"
          rel="noopener noreferrer"
          className="label inline-flex items-center gap-2 underline decoration-rule underline-offset-4 hover:text-red"
        >
          <SocialIcon kind="github" className="h-4 w-4" />
          Source on GitHub ↗
        </a>
      </footer>
    </article>
  );
}
