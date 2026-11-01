-- Training program: one row per prescribed session, in the `training` schema.
-- Mirrors docs/ADMIN.md. The program used to live in data/plan.json; that file
-- is now only the initial seed (`npm run plan:seed`) and a test fixture.
-- Apply with `supabase db push` or paste into the SQL editor.
--
-- Rest days are not stored: a date with no row for an athlete is a rest day.

create table if not exists training.plan_sessions (
  id          text primary key,            -- stable: "<date>-<sport>-<slug of title>" unless provided
  date        date not null,
  sport       text not null check (sport in ('swim', 'bike', 'run', 'strength', 'other')),
  title       text not null,
  detail      text,
  target_min  int,
  target_km   numeric,
  athletes    text[] not null default '{}', -- empty = everyone
  phase       text,
  week        int not null,
  updated_at  timestamptz not null default now()
);

create index if not exists plan_sessions_date_idx
  on training.plan_sessions (date);

alter table training.plan_sessions enable row level security;
-- Intentionally no policies: nothing is readable or writable through the anon
-- or authenticated roles. The service role bypasses RLS.

grant usage on schema training to service_role;
grant all on training.plan_sessions to service_role;

-- `training` is already exposed to PostgREST (see 0001_training.sql), so the
-- service-role client pinned to this schema sees the table immediately.
