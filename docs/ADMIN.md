# Admin: plan uploads

`/admin` is a private page for Filippo to manage the training program. The program lives in Supabase (`training.plan_sessions`), not in the repo; `data/plan.json` is only the initial seed and a fixture for tests.

## Auth

Single admin. `ADMIN_PASSWORD` (env) is compared in constant time; on success a signed, httpOnly, `SameSite=Lax` cookie `rahd_admin` carries an HMAC (`ADMIN_SESSION_SECRET`) over an expiry timestamp (7 days). `/admin/**` and `/api/admin/**` are guarded by `src/proxy.ts` (Next 16's name for middleware; read `node_modules/next/dist/docs` to confirm) which redirects to `/admin/login`. Rate-limit login attempts in memory (5 per 15 min per IP) and never log the password.

## Plan table (`supabase/migrations/0002_plan_sessions.sql`)

```sql
training.plan_sessions (
  id          text primary key,         -- stable: "<date>-<sport>-<slug of title>" unless provided
  date        date not null,
  sport       text not null check (sport in ('swim','bike','run','strength','other')),
  title       text not null,
  detail      text,
  target_min  int,
  target_km   numeric,
  athletes    text[] not null default '{}', -- empty = everyone
  phase       text,
  week        int not null,
  updated_at  timestamptz not null default now()
)
```

RLS on, no anon policies, service_role grants, same as 0001.

## CSV contract (`docs/plan-template.csv`)

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
- `id` optional; when blank it is derived as above. Supplying the same id lets a row be renamed.
- Rest days are omitted.

## Library contract (`src/lib/admin/plan-import.ts`)

```ts
parsePlanCsv(text: string): { rows: PlanSession[]; errors: { line: number; message: string }[] }
diffPlan(incoming: PlanSession[], existing: PlanSession[], opts: { scope: "csv-range" | "all" }): PlanDiff
  // PlanDiff = { added: PlanSession[]; changed: { before: PlanSession; after: PlanSession; fields: string[] }[];
  //              unchanged: number; removed: PlanSession[]; range: { from: string; to: string } }
  // "csv-range": rows in the DB within [min date, max date] of the CSV that are absent from the CSV count as removed.
  // "all": every DB row absent from the CSV counts as removed.
applyPlanDiff(diff: PlanDiff, opts: { deleteRemoved: boolean }): Promise<{ added: number; changed: number; removed: number }>
  // upserts added + changed, deletes removed when asked, then revalidateTag(TRAINING_CACHE_TAG, "max").
exportPlanCsv(rows: PlanSession[]): string
```

`src/lib/training/plan.ts` keeps its pure helpers but `getPlan()` becomes async and reads from the DB through a `"use cache"` loader tagged `TRAINING_CACHE_TAG`, falling back to `data/plan.json` when Supabase env is missing. Tests keep using the JSON fixture directly.

## Admin UI (`src/app/admin/**`)

Same visual language as the rest of the site (SiteHeader, `.sheet`, `.label`, `.num`, pills), one page:

1. Top: "Plan" with counts (sessions in DB, date range, last updated) and buttons: Download CSV (current DB), Download template, Log out.
2. Upload: file input or paste area; "Check" runs parse + diff server-side (Server Action) and renders the preview: validation errors (line numbers) block applying; otherwise a summary strip (added / changed / unchanged / removed) and a table of changed rows showing before → after per field, plus added and removed lists. Scope selector (csv-range / all) and a "delete removed" checkbox, both default conservative (csv-range, delete off).
3. Apply: second Server Action replays the diff from the submitted CSV (do not trust client state), writes, shows the result, links to /training.
4. Recent activities read-only table (last 20 from `training.activities`) with a "Resync Strava" button that calls the sync route with CRON_SECRET server-side.

## Planning-agent brief (`docs/PLANNING-AGENT.md`)

A short, copy-pasteable brief for an LLM: the athlete context, the CSV contract above verbatim, the phase calendar (week numbers and dates), and the instruction to output only CSV. Include a filled example week.
