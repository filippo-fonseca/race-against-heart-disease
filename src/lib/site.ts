/**
 * Single source of truth for campaign copy, dates, and links.
 * Edit here; the UI reads from this file.
 */

export const site = {
  name: "Race Against Heart Disease",
  tagline: "70.3 miles for the next generation of hearts.",
  url: "https://raceagainstheartdisease.com",
  author: {
    name: "Filippo Fonseca",
    age: 20,
    url: "https://filippofonseca.com",
    title: "Yale MechE + EECS '28",
    role: "Cardiovascular Device and Biomechanics Researcher",
    /** Profile picture in /public. */
    avatar: "/filippo.jpg",
    /** One-line bio under the headline. */
    bio: "Cardiovascular and Biomechanics Engineer / Researcher at Yale",
    /**
     * The longer "About me" under the byline, one string per paragraph.
     * Draft: rewrite freely, it is yours to ramble in.
     */
    about: [
      "Endurance runner turned triathlete. I came up through distance running (most recently a 1:23 half marathon) and this season I am adding the swim and the bike for my first 70.3.",
      "Day to day I study Mechanical Engineering and EECS at Yale and do research on cardiovascular devices and biomechanics, which is a big part of why this cause is personal: I spend my days on what happens when hearts fail, and I would rather more of them never get there.",
    ],
    /**
     * Strava widget (strava.com/athletes/<id>, Share your activities). Both
     * values come from the embed code Strava gives you; the hero shows the
     * activity-summary widget once both are set.
     */
    strava: {
      athleteId: process.env.NEXT_PUBLIC_STRAVA_ATHLETE_ID ?? null,
      widgetHash: process.env.NEXT_PUBLIC_STRAVA_WIDGET_HASH ?? null,
    } as { athleteId: string | null; widgetHash: string | null },
    /** Shown under the signature. Order is display order. */
    socials: [
      { kind: "website", label: "Website", href: "https://filippofonseca.com" },
      {
        kind: "strava",
        label: "Strava",
        href: `https://www.strava.com/athletes/${process.env.NEXT_PUBLIC_STRAVA_ATHLETE_ID ?? "REPLACE"}`,
      },
      { kind: "linkedin", label: "LinkedIn", href: "https://linkedin.com/in/filippofonseca" },
      { kind: "x", label: "X", href: "https://x.com/FilippoFonseca" },
      { kind: "github", label: "GitHub", href: "https://github.com/filippo-fonseca" },
      {
        kind: "scholar",
        label: "Google Scholar",
        href: "https://scholar.google.com/citations?user=gIz1jtwAAAAJ",
      },
    ] as { kind: "website" | "strava" | "github" | "linkedin" | "x" | "scholar"; label: string; href: string }[],
  },
  repo: "https://github.com/filippo-fonseca/race-against-heart-disease",
  /** Team IMF personal fundraising page. Set NEXT_PUBLIC_DONATE_URL in Vercel. */
  donateUrl:
    process.env.NEXT_PUBLIC_DONATE_URL ?? "https://www.ironmanfoundation.org/",
  charity: {
    name: "The IRONMAN Foundation",
    team: "Team IMF",
    url: "https://www.ironmanfoundation.org/",
  },
  race: {
    name: "IRONMAN 70.3 Texas",
    shortName: "70.3 Texas",
    city: "Galveston",
    state: "Texas",
    stateAbbr: "TX",
    /** Race morning, local time (CDT). */
    date: new Date("2027-04-04T07:00:00-05:00"),
    dateLabel: "April 4, 2027",
    postmarkDate: "APR 04 2027",
    goalTime: "sub-5:00",
    legs: [
      { label: "Swim", miles: 1.2, km: 1.9 },
      { label: "Bike", miles: 56, km: 90 },
      { label: "Run", miles: 13.1, km: 21.1 },
    ],
    totalMiles: 70.3,
  },
} as const;

export type Stat = {
  value: string;
  label: string;
  source: string;
  sourceLabel: string;
};

/**
 * Figures quoted in the letter's margin. Keep the numbers conservative and
 * cite the primary source; these get checked by people who know the field.
 */
export const stats: Stat[] = [
  {
    value: "34 sec",
    label: "Roughly how often someone in the US dies of cardiovascular disease. Much of it is preventable, and prevention starts early.",
    source: "https://www.cdc.gov/heart-disease/data-research/facts-stats/index.html",
    sourceLabel: "CDC",
  },
  {
    value: "19.8M",
    label: "people die of cardiovascular disease every year worldwide. Coronary heart disease is the largest share.",
    source: "https://www.who.int/news-room/fact-sheets/detail/cardiovascular-diseases-(cvds)",
    sourceLabel: "WHO",
  },
  {
    value: "1 in 4",
    label: "American children get the recommended hour of daily movement. It is a habit that is easiest to build young, and tends to last.",
    source: "https://archive.cdc.gov/www_cdc_gov/healthyschools/physicalactivity/facts.htm",
    sourceLabel: "CDC",
  },
  {
    value: "81%",
    label: "of adolescents worldwide are not active enough. The patterns set in these years follow a heart for the rest of its life.",
    source: "https://www.who.int/news-room/fact-sheets/detail/physical-activity",
    sourceLabel: "WHO",
  },
  {
    value: "60 min",
    label: "a day of active play for children, and 150 minutes a week for adults. Meeting the guideline is tied to roughly a quarter lower risk of dying from heart disease.",
    source: "https://www.heart.org/en/news/2022/07/25/getting-more-exercise-than-guidelines-suggest-may-further-lower-death-risk",
    sourceLabel: "AHA",
  },
];
