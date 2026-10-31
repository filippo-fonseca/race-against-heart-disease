/**
 * Single source of truth for campaign copy, dates, and links.
 * Edit here; the UI reads from this file.
 */

export const site = {
  name: "Race Against Heart Disease",
  tagline: "70.3 miles. One argument: hearts are built to be pushed.",
  url: "https://raceagainstheartdisease.com",
  author: {
    name: "Filippo Fonseca",
    url: "https://filippofonseca.com",
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
    goalTime: "sub-5:15",
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
    label: "Roughly how often someone in the US dies of cardiovascular disease. It has been the leading cause of death for a century.",
    source: "https://www.cdc.gov/heart-disease/data-research/facts-stats/index.html",
    sourceLabel: "CDC",
  },
  {
    value: "19.8M",
    label: "people die of cardiovascular disease every year worldwide. About one in three deaths on Earth.",
    source: "https://www.who.int/news-room/fact-sheets/detail/cardiovascular-diseases-(cvds)",
    sourceLabel: "WHO",
  },
  {
    value: "1 in 4",
    label: "American kids get the recommended hour of daily movement. The other three are learning to sit.",
    source: "https://archive.cdc.gov/www_cdc_gov/healthyschools/physicalactivity/facts.htm",
    sourceLabel: "CDC",
  },
  {
    value: "81%",
    label: "of adolescents worldwide are not active enough. A sedentary childhood is the quietest risk factor we have.",
    source: "https://www.who.int/news-room/fact-sheets/detail/physical-activity",
    sourceLabel: "WHO",
  },
  {
    value: "150 min",
    label: "of brisk movement a week is the dose. Hitting it is tied to roughly a quarter lower risk of dying from heart disease.",
    source: "https://www.heart.org/en/news/2022/07/25/getting-more-exercise-than-guidelines-suggest-may-further-lower-death-risk",
    sourceLabel: "AHA",
  },
];
