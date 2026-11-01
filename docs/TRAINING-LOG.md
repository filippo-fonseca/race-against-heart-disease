# Training log: architecture

The `/training` page is an automated daily log of the build toward IRONMAN 70.3 Texas (April 4, 2027). Training starts **November 2, 2026**. Two athletes train together: Filippo and his training partner Amir. Activities come from Strava automatically; the training program lives in this repo; the page matches the two and charts everything.

## Data flow

```
Strava ──webhook──▶ /api/strava/webhook ──▶ fetch activity detail (+photos) ──▶ Supabase
Strava ◀──backfill── /api/strava/sync (Vercel cron, daily 06:00 UTC; Hobby plan allows daily only, webhooks cover real time) ─────────────▶ Supabase
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

## Setup

Data lives in the shared Supabase project `hyperpolymath-v3` (ref `mwpwnyhtzkabriohwlbq`), in its own `training` schema. The server client is pinned to that schema, so `.from("activities")` resolves to `training.activities`.

1. **Database.** Apply `supabase/migrations/0001_training.sql` (SQL editor or `supabase db push`). PostgREST must also expose the schema: either add `training` under Dashboard > Settings > API > Exposed schemas, or rely on the `alter role authenticator set pgrst.db_schemas = 'public, graphql_public, training'; notify pgrst, 'reload config';` statement at the end of the migration.
2. **Strava app.** Create one at strava.com/settings/api. Set Authorization Callback Domain to `localhost` (the auth script redirects to `http://localhost:4567/callback`). Copy the client id and secret.
3. **Env.** Put the variables from the Environment section above in `.env.local` locally and in the Vercel project. `STRAVA_WEBHOOK_VERIFY_TOKEN` and `CRON_SECRET` are random strings you choose; Vercel sends `CRON_SECRET` to the cron route automatically once it is set. `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` come from the Supabase project settings.
4. **Authorize each athlete** (one time): `npm run strava:auth -- --athlete filippo`, then the same for `amir`. Each run opens the consent page and writes the athlete row with tokens.
5. **Backfill**: `npm run strava:backfill -- --athlete filippo --since 2026-11-02` (omit `--athlete` for both). Re-run if it reports the budget was exhausted.
6. **Webhook** (after the site is deployed with the env above): `npm run strava:subscribe -- --callback https://raceagainstheartdisease.com/api/strava/webhook`. `--list` shows the current subscription and `--delete <id>` removes it. The cron in `vercel.json` hits `/api/strava/sync` every 30 minutes regardless, so a missed webhook event is reconciled within the half hour.

Scripts run through `tsx --conditions=react-server` so the `server-only` marker in `db.ts` is inert outside Next; they read `.env.local` via dotenv.
