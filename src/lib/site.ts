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
    /** Shown in the About me modal and beside the postcard gallery. */
    about: [
      "In my day-to-day, I'm a student at Yale University, where I major in ABET Mechanical Engineering and EECS. My main research and engineering interests lie in surgical robotics, cardiovascular devices, and biomechanics. I'm building physically intelligent systems beyond wearables: deep cardiac tech and internal medicine toolkits that understand, predict, and adapt, treating structure and geometry as first-class objects, not noise to average away. This past summer, I interned at Massachusetts General Hospital in Boston, and I have done research at MIT and in several Yale labs. I also run the Yale Robotics Group, where we are building a Mars Rover capable of detecting life on Mars.",
      "I genuinely believe the greatest limitation of modern healthcare is not treatment, it's timing. Medicine has extended human lifespan; yet biomedical systems remain reactive: we wait for symptoms and intervene after disease has already begun. Hence why I'm doing this IRONMAN for heart disease prevention! If we could incentivize kids and teenagers to build lifelong habits of training their bodies and moving how our bodies were meant to... so much unnecessary suffering could be prevented (for loved ones, the patients, and the entire healthcare system).",
      "In my spare time, by far my greatest passion is endurance sport! I love the way it can bring people together and push you to explore not only the outdoors, but the limits of the human condition (both mental and physical!). I'm mainly a runner, which is my starting point for wanting to do a triathlon at least once in my life. My half marathon PR is 1h 23min, so while I believe I'm a very strong runner, at the time of writing I'm (at best) an average biker and a terrible swimmer. I will work my hardest on my weak areas to make sure we bring heart disease prevention the awareness it deserves!",
      "I'm so incredibly grateful to get to do this, and so incredibly humbled every time I go out on the bike, on a running trail, and (especially) in the pool by how the human body can learn to adapt to so much physical and mental stress, to the point where it's fun! Here's to doing hard things and having fun :)",
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
  /** Team IMF personal fundraising page. NEXT_PUBLIC_DONATE_URL overrides it if set. */
  donateUrl:
    process.env.NEXT_PUBLIC_DONATE_URL ??
    "https://ironmanfoundation.donordrive.com/participants/filippofonseca",
  /**
   * "Why I'm doing this" video on the letter. Paste any YouTube link (watch,
   * youtu.be or Shorts); leave it empty to hide the section. Set `vertical`
   * for a 9:16 Short.
   */
  video: {
    url: "" as string,
    title: "Why I'm doing this",
    vertical: false as boolean,
  },
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
