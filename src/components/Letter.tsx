import { site, stats } from "@/lib/site";
import { Countdown } from "./Countdown";
import { Mark } from "./marks";

export function Letter() {
  return (
    <article
      className="rise relative mx-auto w-full max-w-[720px] border border-rule bg-paper px-6 py-10 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.18)] sm:px-12 sm:py-14"
      aria-labelledby="letter-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="label">Letter No. 01</div>
          <div className="label mt-1 !text-ink">Written standing up</div>
        </div>
        <div className="text-right">
          <div className="label">
            Postmarked {site.race.city}, {site.race.stateAbbr}
          </div>
          <Countdown className="label mt-1 block !text-red" />
        </div>
      </header>

      <hr className="my-8 border-rule" />

      <h1 id="letter-title" className="sr-only">
        {site.name}
      </h1>

      <div className="space-y-6 font-serif text-[1.2rem] leading-[1.55] text-ink sm:text-[1.3rem]">
        <p>
          For what little attention it gets, I was surprised to find out that
          coronary heart disease is the leading cause of death worldwide. What
          makes me the most sad on a personal level is how, more often than
          not, it is entirely preventable. Some people are more genetically
          predisposed than others, and certain factors are out of anyone&apos;s
          control. But the habits we build in childhood and early adulthood
          are the ones that not only persist, but eventually lead to hearts
          that cannot keep up.
        </p>

        <p>
          It often looks like this: plaque builds in the coronary arteries,
          causing years of hypertension and discomfort, until eventually the
          plaque dislodges, a blood clot forms, and the heart muscle is
          starved of oxygen. This breaks my heart (no pun intended),
          particularly because so often the root of it is children simply
          never being exposed to the habits that take care of their hearts,
          and their entire bodies, at all.
        </p>

        <p>
          Thus, on{" "}
          <strong className="font-semibold">{site.race.dateLabel}</strong>, in{" "}
          {site.race.city}, {site.race.state}, I will swim 1.2 miles, bike 56,
          and run 13.1 with {site.charity.team}, the charity team of{" "}
          {site.charity.name}. I am not racing to prove I am an athlete. I am
          racing to show, as plainly as I can, what a heart is capable of when
          it is cared for from the start, and to raise money for a foundation
          that puts that chance in front of young people.
        </p>

        <p>
          Here is what I hope this letter does. If you are able to give, every
          dollar goes to {site.charity.name}. And whether or not you give, I
          hope you will take a child you love outside this week and move with
          them. It is among the best gifts you can give a heart, and it costs
          nothing at all.
        </p>

        <p>Thank you for reading, and for caring about this with me.</p>
      </div>

      <div className="mt-10">
        <div className="font-serif text-[1.2rem] italic text-ink-soft">
          With gratitude, and in motion,
        </div>
        <div className="font-hand mt-1 text-[2.6rem] leading-none text-red">
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

      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
        <a
          href={site.donateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 bg-red px-6 py-3.5 font-serif text-[1.05rem] text-paper transition-colors hover:bg-red-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red"
        >
          <Mark className="h-5 w-5" knockout={false} />
          Give through {site.charity.team}
        </a>
        <span className="label sm:ml-2">
          100% to {site.charity.name}
        </span>
      </div>

      <p className="mt-8 font-serif text-[1.05rem] italic leading-relaxed text-ink-soft">
        P.S. This page is open source. The training, the race-day splits,
        and the fundraising total will all be published here as they happen.
      </p>

      <hr className="my-10 border-rule" />

      <section aria-labelledby="fine-print">
        <h2 id="fine-print" className="label">
          The fine print
        </h2>
        <dl className="mt-6 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
          {stats.map((s) => (
            <div key={s.value + s.sourceLabel}>
              <dt className="font-serif text-[2.4rem] leading-none tracking-tight text-red">
                {s.value}
              </dt>
              <dd className="mt-2 font-serif text-[1.02rem] leading-snug text-ink">
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

      <hr className="my-10 border-rule" />

      <section aria-label="Race distances" className="flex flex-wrap items-end gap-x-8 gap-y-4">
        {site.race.legs.map((leg) => (
          <div key={leg.label}>
            <div className="label">{leg.label}</div>
            <div className="mt-1 font-serif text-[1.8rem] leading-none tracking-tight">
              {leg.miles}
              <span className="ml-1 text-[0.9rem] text-ink-soft">mi</span>
            </div>
          </div>
        ))}
        <div className="ml-auto text-right">
          <div className="label">Total</div>
          <div className="mt-1 font-serif text-[1.8rem] leading-none tracking-tight text-red">
            {site.race.totalMiles}
            <span className="ml-1 text-[0.9rem] text-ink-soft">mi</span>
          </div>
        </div>
      </section>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-6">
        <span className="label">
          {site.race.name} · {site.race.city}, {site.race.stateAbbr}
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
