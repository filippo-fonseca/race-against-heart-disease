# Training log: architecture

The `/training` page is an automated, purely retroactive log of Filippo's build toward IRONMAN 70.3 Texas. There is no plan anywhere: the site shows only what Strava recorded. Everything covers one fixed window, **November 2, 2026 (day 1)** to **race day, April 4, 2027 (day 154)**.

## Data flow

```
                 webhook (real time)
  Strava ──────────────────────────────▶ /api/strava/webhook ──┐
    ▲    ──── cron (daily 06:00 UTC) ──▶ /api/strava/sync ─────┤ fetch detail
    │    ──── backfill (one time) ─────▶ npm run strava:backfill┤ (+ photos)
    │                                                           ▼
    │                                         Supabase: training.activities
    │                                         (a cache of Strava, plus MCP photos)
    │                                                           │
    │                                           loadTraining() ("use cache",
    │                                           tag "training", 1 h lifetime)
    │                                                           ▼
    │                                  /training feed + charts, homepage card
    │
  Grok bot ──▶ /api/mcp ──▶ writes activities to Strava, not to the DB;
                            the webhook then brings the change back
```

Pages never call Strava. Strava allows 100 requests per 15 min and 1,000 per day, and photos need one detail call per activity, so every activity is cached in Postgres and the writers revalidate the `training` cache tag after each write. The Grok bot's MCP server (see [MCP.md](MCP.md)) creates and edits activities on Strava itself, so the change reaches the site the same way any other activity does. Photos it attaches (Strava's API takes no uploads) are stored in the public `training-photos` Supabase Storage bucket and listed on the activity next to Strava's; a resync keeps them.

## The window and its numbers

`src/lib/training/dates.ts` owns the window: `TRAINING_START` (2026-11-02, a Monday), `RACE_DAY` (2027-04-04, matching `site.race.date` in race-local time), `TRAINING_DAYS` (154), `TRAINING_WEEKS` (22), plus `dayNumber`, `weekNumber`, `weekStartFor` and `daysToRace`. Queries load only activities dated inside the window, and the page shows only those up to today.

## Sports

Every activity lands in one of four buckets, shown everywhere as pills (`src/components/training/SportPill.tsx`):

| Pill | Internal | Strava sport types |
| --- | --- | --- |
| SWIM | `swim` | any swim |
| BIKE | `bike` | any ride: outdoor, trainer (`Ride` with `trainer: true`), `VirtualRide`, e-bike, gravel, mountain |
| RUN | `run` | any run: road, trail, virtual |
| LIFT | `strength` | everything else: HIIT, weights, workouts, yoga, walks, hikes |

`toSport` (`src/lib/training/types.ts`) does the mapping. Rows are re-bucketed from `strava_sport_type` on every read (`toActivity` in `db.ts`), so a change to the mapping applies to existing rows without a resync. The legacy value `other` is still in the `Sport` type for older callers but is never produced.

**Stats rule.** Totals report swims and runs by distance and rides and lifts by time. Most rides are indoor trainer sessions with no distance, so a ride never shows "0.0 km": its distance appears only when it is above zero. The cumulative chart plots hours for all four sports for the same reason.

## What `/training` shows

- **Header**: title, race and date, and "Day N of 154".
- **Numerals**: days to race, hours trained, sessions, streak, then one total per sport (SWIM km, BIKE time, RUN km, LIFT time).
- **Feed**: one card per activity, newest first, under quiet day headers ("Day 8 · Sun, Nov 8") and subtle week separators. Days with nothing logged are absent. Each card has the pill, the name, the local start time and a line of description, two to four stat figures, and the photos (Strava's plus any attached through the MCP) as a large single image or a grid with a "+N" tile, opening in an accessible lightbox.
- **Chart rail** (sticky on desktop, a swipeable strip on phones): calendar heatmap, hours per week stacked by sport, cumulative hours per sport, and a heart-rate histogram. As each week of cards scrolls past a reading line, `ScrollSpy.tsx` highlights that week in every chart through the `data-week` marks.

The homepage Strava card (`src/components/StravaEmbed.tsx`) reads the same cached data: sessions, hours, "Day N of 154", the four sport totals, and the latest activity with its pill, Day number and a photo thumbnail.

`/training?mock=1` renders deterministic fixtures (`src/lib/training/mock.ts`) outside production.

## Supabase schema (`supabase/migrations/`)

```sql
athletes (
  slug text primary key,              -- 'filippo'
  name text not null,
  strava_id bigint unique,
  avatar_url text,
  access_token text, refresh_token text, expires_at bigint,
  created_at timestamptz default now()
)

activities (
  id bigint primary key,              -- Strava activity id
  athlete_slug text references athletes(slug),
  sport text not null,                -- as stored at sync time; re-derived on read
  strava_sport_type text not null,
  name text not null,
  description text,
  start_local timestamptz not null,   -- stored as UTC; local time restored from raw->utc_offset
  date date not null,                 -- athlete-local calendar day
  moving_time_sec int, elapsed_time_sec int,
  distance_m numeric, elevation_gain_m numeric,
  avg_hr numeric, max_hr numeric, avg_watts numeric, effort numeric,
  photos jsonb not null default '[]',
  detailed boolean not null default false,
  raw jsonb,
  updated_at timestamptz default now()
)
```

Row Level Security is enabled on both tables with no anon policies. The server uses the service-role key only in server code; tokens never reach the client. An older `plan_sessions` table from migration 0002 still exists but nothing reads or writes it.

## Environment

```
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_WEBHOOK_VERIFY_TOKEN=        # any random string
CRON_SECRET=                        # Vercel cron auth
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=                     # /admin login (see ADMIN.md)
ADMIN_SESSION_SECRET=
MCP_TOKEN=                          # bearer token for /api/mcp (Grok bot); unset = endpoint off (503)
```

## Code map

| Path | Role |
| --- | --- |
| `src/lib/training/types.ts` | shared contract: activities, sport buckets, `toSport` |
| `src/lib/training/dates.ts` | calendar helpers and the training window |
| `src/lib/training/strava.ts`, `sync.ts`, `src/app/api/strava/**`, `scripts/strava-*.ts` | Strava to Supabase |
| `src/lib/training/db.ts`, `queries.ts`, `load.ts` | reading the cache (Filippo's rows only) |
| `src/lib/training/aggregate.ts`, `src/components/training/model.ts` | totals, weekly rows, cumulative time, feed grouping |
| `src/app/training/**`, `src/components/training/**` | the page, feed, pills, photos and charts |
| `src/components/StravaEmbed.tsx` | the homepage card |
| `src/lib/mcp/**`, `src/app/api/mcp/**` | the Grok bot's MCP server ([MCP.md](MCP.md)) |

## Setup

Local scripts need Node 22 or newer (`.nvmrc` says 22): supabase-js throws on Node 20 because it has no native WebSocket. Vercel builds on Node 26 and is unaffected.

Data lives in the shared Supabase project `hyperpolymath-v3` (ref `mwpwnyhtzkabriohwlbq`), in its own `training` schema. The server client is pinned to that schema, so `.from("activities")` resolves to `training.activities`.

1. **Database.** Apply `supabase/migrations/0001_training.sql` (SQL editor or `supabase db push`). PostgREST must also expose the schema: either add `training` under Dashboard > Settings > API > Exposed schemas, or rely on the `alter role authenticator set pgrst.db_schemas = 'public, graphql_public, training'; notify pgrst, 'reload config';` statement at the end of the migration.
2. **Strava app.** Create one at strava.com/settings/api. Set Authorization Callback Domain to `localhost` (the auth script redirects to `http://localhost:4567/callback`). Copy the client id and secret.
3. **Env.** Put the variables above in `.env.local` locally and in the Vercel project. `STRAVA_WEBHOOK_VERIFY_TOKEN` and `CRON_SECRET` are random strings you choose; Vercel sends `CRON_SECRET` to the cron route automatically once it is set.
4. **Authorize** (one time): `npm run strava:auth -- --athlete filippo` opens the consent page (scope `activity:read_all`) and writes the athlete row with tokens.
5. **Backfill**: `npm run strava:backfill -- --athlete filippo --since 2026-11-02`. Re-run if it reports the budget was exhausted.
6. **Webhook** (after the site is deployed with the env above): `npm run strava:subscribe -- --callback https://raceagainstheartdisease.com/api/strava/webhook`. `--list` shows the current subscription and `--delete <id>` removes it. The daily cron in `vercel.json` reconciles anything a missed webhook event left behind.

Scripts run through `tsx --conditions=react-server` so the `server-only` marker in `db.ts` is inert outside Next; they read `.env.local` via dotenv.
