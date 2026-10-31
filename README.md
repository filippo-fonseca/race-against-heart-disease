# Race Against Heart Disease

A sealed letter, addressed to whoever is sitting down right now.

On **April 4, 2027**, [Filippo Fonseca](https://filippofonseca.com) races **IRONMAN 70.3 Texas** in Galveston (1.2 mi swim, 56 mi bike, 13.1 mi run) with **Team IMF**, the charity team of [The IRONMAN Foundation](https://www.ironmanfoundation.org/). Every dollar donated through the campaign link goes to the Foundation.

The race is the proof. The point is the argument: heart disease is the leading cause of death on Earth, most of it is preventable, and the cheapest medicine we have is movement. We are raising a generation of kids who sit. This site exists to say that out loud, once, in the form of a letter.

## The site

One page. A stamped, postmarked envelope held shut by a red wax seal. Press the seal and the letter unfolds: a short note, a donate button, the figures behind the argument (each one cited), and the race distances.

- White and red. Serif body (EB Garamond), mono labels (Geist Mono), handwritten signature (Caveat).
- No tracking, no cookies, no analytics beyond whatever the host provides.
- Respects `prefers-reduced-motion`.
- The IRONMAN name and "70.3" appear in type only. The M-dot is a registered trademark of World Triathlon Corporation and is not reproduced here.

## Run it

```bash
npm install
npm run dev
```

Set the fundraising link before deploying:

```bash
# .env.local
NEXT_PUBLIC_DONATE_URL=https://ironmanfoundation.donordrive.com/participant/...
```

Everything editable (copy, dates, links, the cited stats) lives in [`src/lib/site.ts`](src/lib/site.ts).

## Sources

Figures quoted on the page, with the primary source for each:

| Figure | Claim | Source |
| --- | --- | --- |
| ~34 sec | Interval between cardiovascular deaths in the US | [CDC](https://www.cdc.gov/heart-disease/data-research/facts-stats/index.html) |
| 19.8M | Annual cardiovascular deaths worldwide, about 32% of all deaths | [WHO](https://www.who.int/news-room/fact-sheets/detail/cardiovascular-diseases-(cvds)) |
| 1 in 4 | US children aged 6 to 17 who meet the 60 min/day activity guideline (24%) | [CDC](https://archive.cdc.gov/www_cdc_gov/healthyschools/physicalactivity/facts.htm) |
| 81% | Adolescents worldwide who are insufficiently active | [WHO](https://www.who.int/news-room/fact-sheets/detail/physical-activity) |
| 150 min | Weekly moderate activity guideline; meeting it is associated with roughly 22 to 25% lower cardiovascular mortality | [AHA](https://www.heart.org/en/news/2022/07/25/getting-more-exercise-than-guidelines-suggest-may-further-lower-death-risk) |

If a number here is wrong or out of date, open an issue. The whole point is to be held to it.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS v4. Deployed on Vercel.

## License

MIT. The letter's words are Filippo's; reuse the code freely, write your own letter.
