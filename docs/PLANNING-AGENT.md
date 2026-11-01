# Planning-agent brief

Copy everything below the line into an LLM session when you want it to write or revise part of the training program. Paste its output into the upload box on `/admin`, press Check, review the diff, then Apply. The upload replaces only the dates the CSV covers unless you choose the "all" scope.

---

You are writing sessions for a 22-week IRONMAN 70.3 training program. Output only CSV in the exact format below: no prose, no Markdown fences, no commentary before or after. The first line must be the header.

## Athletes

Two athletes train together and share the plan unless a row names one of them.

- `filippo`: strong runner (1:23 half marathon) returning from a knee issue on low run volume, so run frequency and time on feet climb gently and Monday is always a full rest day. New to swimming (first swim October 30, 2026). Regular indoor cyclist. Goal: sub-5:00 at IRONMAN 70.3 Texas on April 4, 2027, roughly a 35 min swim (1:50 per 100 m), a 2:30 bike (about 36 kph) and a 1:40 run (4:45 per km) plus transitions.
- `emir`: training partner, same race, same schedule. Assume the same plan applies unless told otherwise.

Weekly skeleton (Monday rest, omitted from the CSV):

- Tue: swim (technique) and bike (intervals)
- Wed: run (quality) and strength (knee rehab A)
- Thu: swim (main set) and run (easy), Base phases only
- Fri: bike (easy spin) and strength (hip and glute B)
- Sat: long ride, plus a brick run from Build 1 onward
- Sun: long run and swim (continuous)

Every fourth week (4, 8, 12, 16) is a recovery week at roughly 65 to 70 percent of the preceding week's volume. Weeks 4, 8 and 16 carry benchmark tests (FTP test; 400 m swim time trial in weeks 4 and 8). Week 18 holds the race simulation. Keep prose free of em dashes and en dashes; use commas, colons or periods.

## CSV contract

Header row, UTF-8, comma-separated, quoted fields allowed:

```
date,sport,title,detail,target_min,target_km,athletes,phase,week,id
2026-11-03,run,Easy run,"Z2, walk breaks fine",35,,,Base 1,1,
2026-11-03,swim,Technique,"4 x 50 drill, 4 x 100 easy",30,1.2,"filippo;emir",Base 1,1,
```

- `date` ISO `YYYY-MM-DD`, must be between the program start (2026-11-02) and race day (2027-04-04).
- `sport` one of swim, bike, run, strength, other.
- `athletes` semicolon-separated slugs (`filippo`, `emir`); blank means both.
- `target_min` / `target_km` integers / decimals, blank allowed.
- `week` 1 to 22; `phase` free text (Base 1, Base 2, Build 1, Build 2, Peak, Taper).
- `id` optional; when blank it is derived as `<date>-<sport>-<slug of title>`. Supplying the same id lets a row be renamed.
- Rest days are omitted.

Quote any field that contains a comma, a double quote or a line break, and double any quote inside it. The `week` value must match the calendar below for the row's date. `title` is short (a few words); `detail` is the full prescription an athlete reads before the session.

## Phase calendar

Weeks run Monday to Sunday. Week 1 starts Monday 2026-11-02; race day is Sunday 2027-04-04, the last day of week 22.

| Week | Phase | Monday | Sunday |
| --- | --- | --- | --- |
| 1 | Base 1 | 2026-11-02 | 2026-11-08 |
| 2 | Base 1 | 2026-11-09 | 2026-11-15 |
| 3 | Base 1 | 2026-11-16 | 2026-11-22 |
| 4 | Base 1 | 2026-11-23 | 2026-11-29 |
| 5 | Base 2 | 2026-11-30 | 2026-12-06 |
| 6 | Base 2 | 2026-12-07 | 2026-12-13 |
| 7 | Base 2 | 2026-12-14 | 2026-12-20 |
| 8 | Base 2 | 2026-12-21 | 2026-12-27 |
| 9 | Build 1 | 2026-12-28 | 2027-01-03 |
| 10 | Build 1 | 2027-01-04 | 2027-01-10 |
| 11 | Build 1 | 2027-01-11 | 2027-01-17 |
| 12 | Build 1 | 2027-01-18 | 2027-01-24 |
| 13 | Build 2 | 2027-01-25 | 2027-01-31 |
| 14 | Build 2 | 2027-02-01 | 2027-02-07 |
| 15 | Build 2 | 2027-02-08 | 2027-02-14 |
| 16 | Build 2 | 2027-02-15 | 2027-02-21 |
| 17 | Peak | 2027-02-22 | 2027-02-28 |
| 18 | Peak | 2027-03-01 | 2027-03-07 |
| 19 | Peak | 2027-03-08 | 2027-03-14 |
| 20 | Taper | 2027-03-15 | 2027-03-21 |
| 21 | Taper | 2027-03-22 | 2027-03-28 |
| 22 | Taper | 2027-03-29 | 2027-04-04 |

## Example: week 1, complete

```
date,sport,title,detail,target_min,target_km,athletes,phase,week,id
2026-11-03,swim,Swim: technique,"Technique: 200 easy, then 8-12 x 50 drill/swim (catch-up, fingertip drag, side kick), 4 x 25 breathing every 3, 200 easy. Rest as needed; form over distance.",35,1.2,,Base 1,1,
2026-11-03,bike,Bike: intervals,"Cadence and sweet spot: 15 min easy, 3 x 8 min at 88-93% FTP (cadence 90+) with 4 min easy, 10 min easy.",60,32,,Base 1,1,
2026-11-04,run,Run: easy,"Easy aerobic run, conversational (Z2). Soft surface where possible. 6 x 20 s relaxed strides at the end.",25,5,,Base 1,1,
2026-11-04,strength,Strength A,"Knee rehab A: Spanish squats 3 x 45 s, Bulgarian split squats 3 x 8 per side, single-leg RDL 3 x 8, step-downs 3 x 10, side plank 3 x 30 s.",40,,,Base 1,1,
2026-11-05,swim,Swim: main set,"Endurance: 200 easy, 10-14 x 100 steady with 20-30 s rest. Hold form; stop the set if it falls apart. 100 easy.",40,1.4,,Base 1,1,
2026-11-05,run,Run: easy,"Easy aerobic run, conversational. Soft surface. Stop early if the knee complains.",25,5,,Base 1,1,
2026-11-06,bike,Bike: easy spin,"Easy Z1-Z2 spin, cadence 90-100. Flush the legs; include 4 x 30 s high-cadence spin-ups.",45,21,,Base 1,1,
2026-11-06,strength,Strength B,"Hip and glute B: hip thrusts 3 x 10, banded clamshells 3 x 15, lateral band walks 3 x 12, single-leg calf raises 3 x 15, dead bugs 3 x 10.",40,,,Base 1,1,
2026-11-07,bike,Long ride,"75 min Z2 endurance ride (65-75% FTP). Steady, fueled, no surges. Practice eating 60 g carbs per hour.",75,40,,Base 1,1,
2026-11-08,run,Long run,45 min easy aerobic run (Z2). Build the knee's tolerance to time on feet; walk breaks are fine.,45,9,,Base 1,1,
2026-11-08,swim,Swim: continuous,"Continuous: swim as far as you can without stopping at an easy effort, then finish with 4 x 50 easy. Breathe bilaterally.",30,1,,Base 1,1,
```

When asked for a range of weeks, output every session for every week in the range, in date order, and nothing else.
