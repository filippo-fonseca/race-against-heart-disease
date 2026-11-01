-- Training log: athletes + activities, in their own `training` schema.
-- Mirrors docs/TRAINING-LOG.md. This lives in the shared "hyperpolymath-v3"
-- Supabase project (ref mwpwnyhtzkabriohwlbq), so nothing goes in `public`.
-- Apply with `supabase db push` or paste into the SQL editor.
--
-- Tokens live here and are only ever read by server code using the
-- service-role key; RLS is on with no policies, so the anon key sees nothing.

create schema if not exists training;

create table if not exists training.athletes (
  slug          text primary key,            -- 'filippo' | 'emir'
  name          text not null,
  strava_id     bigint unique,
  avatar_url    text,
  access_token  text,
  refresh_token text,
  expires_at    bigint,                      -- unix seconds
  created_at    timestamptz not null default now()
);

create table if not exists training.activities (
  id                bigint primary key,      -- Strava activity id
  athlete_slug      text not null references training.athletes(slug) on delete cascade,
  sport             text not null check (sport in ('swim', 'bike', 'run', 'strength', 'other')),
  strava_sport_type text not null,
  name              text not null,
  description       text,
  start_local       timestamptz not null,
  date              date not null,           -- athlete-local calendar day
  moving_time_sec   int,
  elapsed_time_sec  int,
  distance_m        numeric,
  elevation_gain_m  numeric,
  avg_hr            numeric,
  max_hr            numeric,
  avg_watts         numeric,
  effort            numeric,
  photos            jsonb not null default '[]'::jsonb,
  detailed          boolean not null default false,
  raw               jsonb,
  updated_at        timestamptz not null default now()
);

create index if not exists activities_athlete_slug_date_idx
  on training.activities (athlete_slug, date);

alter table training.athletes   enable row level security;
alter table training.activities enable row level security;
-- Intentionally no policies: nothing is readable or writable through the anon
-- or authenticated roles. The service role bypasses RLS.

grant usage on schema training to service_role;
grant all on all tables in schema training to service_role;
alter default privileges in schema training grant all on tables to service_role;

-- PostgREST only serves schemas it is told about. Add `training` under
-- Dashboard > Settings > API > Exposed schemas (done for hyperpolymath-v3 on
-- 2026-11-01 via the Management API). Not set here: an in-database
-- `alter role authenticator set pgrst.db_schemas` would override the
-- dashboard value for every schema on this shared project.
