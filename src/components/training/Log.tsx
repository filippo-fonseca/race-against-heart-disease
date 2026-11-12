import type { CSSProperties } from "react";
import { dayNumber } from "@/lib/training/dates";
import { bucketOf, type Activity } from "@/lib/training/types";
import { fmtClock, fmtDay, fmtHM, fmtKm, fmtPace, fmtWeekRange } from "./format";
import { dayAnchor, type FeedWeek } from "./model";
import { Photos } from "./Photos";
import { SportPill } from "./SportPill";
import { SocialIcon } from "../Socials";

const step = (i: number) => ({ "--i": i }) as CSSProperties;

interface Stat {
  value: string;
  unit?: string;
  label: string;
}

/**
 * Two to four headline figures per card, following the stats rule: swims and
 * runs lead with distance, rides and lifts lead with time. A ride shows its
 * distance only when Strava recorded one (indoor rides have none).
 */
export function activityStats(a: Activity): Stat[] {
  const sport = bucketOf(a.sport);
  const time: Stat = { value: fmtHM(a.movingTimeSec), label: "Time" };
  const km: Stat | null = a.distanceM > 0 ? { value: fmtKm(a.distanceM, sport), unit: "km", label: "Distance" } : null;
  const pace = fmtPace(a.movingTimeSec, a.distanceM, sport);
  const hr: Stat | null = a.avgHr ? { value: String(Math.round(a.avgHr)), unit: "bpm", label: "Avg HR" } : null;
  const watts: Stat | null = a.avgWatts ? { value: String(Math.round(a.avgWatts)), unit: "W", label: "Avg power" } : null;

  let stats: (Stat | null)[];
  if (sport === "swim") stats = [km, time, pace ? { value: pace, unit: "/100m", label: "Pace" } : null, hr];
  else if (sport === "run") stats = [km, time, pace ? { value: pace, unit: "/km", label: "Pace" } : null, hr];
  else if (sport === "bike") stats = [time, km, watts, hr];
  else stats = [time, hr, watts];
  return stats.filter((s): s is Stat => s !== null).slice(0, 4);
}

/** Strava brand orange. */
const STRAVA_ORANGE = "#FC4C02";

/** "View on Strava" pill (Strava's required wording for links back to an activity). */
function StravaLink({ id, name }: { id: string; name: string }) {
  return (
    <a
      href={`https://www.strava.com/activities/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View ${name} on Strava`}
      title="View on Strava"
      className="mt-[0.2rem] inline-flex h-7 w-7 shrink-0 items-center justify-center gap-1.5 rounded-full font-mono text-[0.64rem] font-bold uppercase tracking-[0.1em] text-white sm:w-auto sm:px-2.5 transition-[filter,transform] hover:brightness-110 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FC4C02]"
      style={{ backgroundColor: STRAVA_ORANGE }}
    >
      <SocialIcon kind="strava" className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">View on Strava</span>
    </a>
  );
}

function ActivityCard({ a }: { a: Activity }) {
  const stats = activityStats(a);
  return (
    <li className="activity-card overflow-hidden rounded-2xl bg-paper">
      <article aria-label={a.name} className="px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-5">
        <div className="flex items-start gap-2.5">
          <SportPill sport={a.sport} className="mt-[0.35rem]" />
          <h4 className="min-w-0 flex-1 font-serif text-[1.3rem] leading-snug text-ink sm:text-[1.4rem]">{a.name}</h4>
          <StravaLink id={a.id} name={a.name} />
        </div>
        <p className="mt-1.5 line-clamp-2 text-[0.98rem] leading-snug text-ink-soft" title={a.description ?? undefined}>
          <span className="num text-[0.82rem]">{fmtClock(a.startLocal)}</span>
          {a.description ? (
            <>
              <span aria-hidden="true"> · </span>
              <span className="font-serif italic">{a.description}</span>
            </>
          ) : null}
        </p>
        {stats.length > 0 ? (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex min-w-0 flex-col-reverse">
                <dt className="label mt-1">{s.label}</dt>
                <dd className="num truncate text-[1.45rem] leading-none text-ink sm:text-[1.6rem]">
                  {s.value}
                  {s.unit ? <span className="ml-1 text-[0.8rem] text-ink-soft">{s.unit}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </article>
      <Photos photos={a.photos} alt={`${a.name}, ${fmtDay(a.date)}`} />
    </li>
  );
}

/**
 * The feed: one card per activity, newest first, under quiet day headers
 * ("Day 8 · Sun, Nov 8") and subtle week separators. Days with nothing logged
 * are simply absent. Each week is a `data-week-section` the ScrollSpy watches.
 */
export function Log({ weeks, today }: { weeks: FeedWeek[]; today: string }) {
  return (
    <div className="space-y-12">
      {weeks.map((w, wi) => (
        <section
          key={w.week}
          data-week-section={w.week}
          data-week-label={`Week ${w.week} · ${fmtWeekRange(w.weekStart)}`}
          aria-labelledby={`week-${w.week}`}
          className={wi < 2 ? "rise" : ""}
          style={step(4 + wi)}
        >
          <h2 id={`week-${w.week}`} className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
            <span className="label">
              Week {w.week} · {fmtWeekRange(w.weekStart)}
            </span>
            <span className="label">{fmtHM(w.totalSec)}</span>
          </h2>
          <div className="mt-6 space-y-8">
            {w.days.map((d) => {
              const isToday = d.date === today;
              return (
                <div key={d.date} id={dayAnchor(d.date)} className="cal-target scroll-mt-28">
                  <h3 className={`label ${isToday ? "!text-red" : "!text-ink"}`}>
                    Day {dayNumber(d.date)} · <time dateTime={d.date}>{fmtDay(d.date)}</time>
                    {isToday ? " · Today" : ""}
                  </h3>
                  <ul className="mt-3 space-y-4">
                    {d.activities.map((a) => (
                      <ActivityCard key={a.id} a={a} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
