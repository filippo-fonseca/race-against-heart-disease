# Training log: architecture

The `/training` page is an automated daily log of the build toward IRONMAN 70.3 Texas (April 4, 2027). Training starts **November 2, 2026**. Two athletes train together: Filippo and his training partner Amir. Activities come from Strava automatically; the training program lives in this repo; the page matches the two and charts everything.

## Data flow

```
Strava ──webhook──▶ /api/strava/webhook ──▶ fetch activity detail (+photos) ──▶ Supabase
Strava ◀──backfill── /api/strava/sync (Vercel cron, every 30 min) ─────────────▶ Supabase
Supabase ──▶ src/lib/training/queries.ts ──▶ /training (server components, ISR 5 min)
data/plan.json ──▶ src/lib/training/plan.ts ──▶ matcher ──▶ /training
```

Pages never call Strava directly. Strava's limits are 100 requests / 15 min and 1,000 / day, and photos require one detail call per activity, so everything is cached in Postgres.

## Supabase schema (`supabase/migrations/`)

```sql
athletes (
  slug text primary key,              -- 'filippo' | 'amir'
  name text not null,
  strava_id bigint unique,
  avatar_url text,
  access_token text, refresh_token text, expires_at bigint,
  created_at timestamptz default now()
)

activities (
  id bigint primary key,              -- Strava activity id
  athlete_slug text references athletes(slug),
  sport text not null,                -- swim|bike|run|strength|other
  strava_sport_type text not null,
  name text not null,
  description text,
  start_local timestamptz not null,
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

Row Level Security: enabled on both tables; no anon policies. The server uses the service-role key only in server code. Tokens never reach the client.

## Environment

```
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_WEBHOOK_VERIFY_TOKEN=        # any random string
CRON_SECRET=                        # Vercel cron auth
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

## Athlete onboarding (one time, each)

`npm run strava:auth -- --athlete filippo` opens the Strava OAuth consent page (scope `activity:read_all`), catches the redirect on `http://localhost:4567/callback`, exchanges the code, and upserts the athlete row with tokens. Then `npm run strava:backfill -- --athlete filippo --since 2026-11-02`.

Webhook subscription is created once with `npm run strava:subscribe` (needs the deployed URL).

## Code ownership

| Path | Owner |
| --- | --- |
| `src/lib/training/types.ts` | shared contract, change first |
| `src/lib/training/strava.ts`, `db.ts`, `queries.ts`, `sync.ts` | data layer |
| `src/app/api/strava/**`, `scripts/strava-*.ts`, `supabase/**`, `vercel.json` | data layer |
| `data/plan.json`, `src/lib/training/plan.ts`, `matcher.ts`, `aggregate.ts` | plan + math |
| `src/app/training/**`, `src/components/training/**` | UI |
| `src/lib/training/mock.ts` | UI (fixtures while the data layer lands) |

## UI direction

One long page. Left: the log as prose, one entry per day, newest first, each with the planned session, what actually happened, Strava photos, and a one-line auto-generated note ("Planned 60 min Z2 ride. Rode 62 min, 145 bpm avg."). Right, sticky: a rail of charts that update to the week/day being scrolled past (AI 2027 pattern): calendar heatmap since Nov 2, weekly hours by sport vs plan, cumulative distance toward 70.3-multiples, HR distribution. Sparse, technical, monospace numerals, white and red, hairline rules, no cards. Top: big numerals (days to race, total hours, sessions, streak) and an athlete toggle.
