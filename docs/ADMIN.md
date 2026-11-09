# Admin

`/admin` is a private page for Filippo. The training log is purely retroactive (everything comes from Strava; see [TRAINING-LOG.md](TRAINING-LOG.md)), so there is nothing to edit here. The page is for checking the sync.

## Auth

Single admin. `ADMIN_PASSWORD` (env) is compared in constant time; on success a signed, httpOnly, `SameSite=Lax` cookie `rahd_admin` carries an HMAC (`ADMIN_SESSION_SECRET`) over an expiry timestamp (7 days). `/admin/**` and `/api/admin/**` are guarded by `src/proxy.ts` (Next 16's name for middleware), which redirects to `/admin/login`; every page and action re-checks the session. Login attempts are rate-limited in memory (5 per 15 min per IP) and the password is never logged.

## The page (`src/app/admin/**`)

Same visual language as the rest of the site (SiteHeader, `.sheet`, `.label`, `.num`, pills):

1. **Header**: "Admin" and a Log out button.
2. **Recent activities**: the last 20 rows of `training.activities` (read live, not cached) with date, local start time, sport pill, name, time, distance (blank when zero, as on indoor rides), average heart rate, and whether the row has been enriched with the detail call.
3. **Resync Strava**: a Server Action that calls `/api/strava/sync` server-side with `CRON_SECRET` and reports what it listed, upserted and enriched.

## Removed

The plan CSV upload (check, diff, apply), its download routes and the planning-agent brief were removed along with the plan itself. The `training.plan_sessions` table from migration 0002 is left in place but nothing reads or writes it.
