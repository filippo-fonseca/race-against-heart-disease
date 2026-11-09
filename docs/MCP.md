# MCP server (Grok bot control)

The site runs a remote [Model Context Protocol](https://modelcontextprotocol.io) server so the owner's Grok bot can read and edit the training backend: the plan, the activity log, session photos, the Strava sync and the fundraising total. Everything the bot writes shows up on `/training` and the homepage on the next page load.

**Strava is the single source of truth for activities.** The activity tools never write activity data to Supabase on their own: `log_activities` and `update_activity` call the Strava API with the athlete's token, then pull the result back into the Supabase mirror (`syncActivity`) so the site updates at once. Deleting happens in the Strava app, because Strava's API has no delete endpoint; the webhook then removes the activity from the site. Two things have no Strava equivalent and stay local: the training plan (`training.plan_sessions`) and photos uploaded through `add_photo` (Supabase Storage, keyed by the Strava activity id). See the data flow in [TRAINING-LOG.md](TRAINING-LOG.md#data-flow).

- **URL:** `https://race-against-heart-disease.vercel.app/api/mcp`
- **Transport:** Streamable HTTP, stateless (each POST is a complete JSON-RPC exchange; no sessions). Built on `mcp-handler` 2.3.0 and `@modelcontextprotocol/server` 2.3.1, so it answers both the 2025-era protocol (`2025-06-18` and earlier Streamable HTTP clients) and the 2026-07-28 revision.
- **Code:** route `src/app/api/mcp/route.ts`; tool registry `src/lib/mcp/server.ts`; tool bodies in `src/lib/mcp/*-tools.ts`; pure logic (tested) in `src/lib/mcp/*-logic.ts`, `validate.ts`, `auth.ts`; tests in `src/lib/mcp/__tests__/`.

## Auth

Every request needs `Authorization: Bearer <MCP_TOKEN>`. The comparison is constant time (`src/lib/safe-equal.ts`). A bare token as the whole header value is also accepted, for clients that put only the token in the `authorization` field.

| Situation | Response |
| --- | --- |
| `MCP_TOKEN` unset in the environment | `503`, the server does nothing (never open) |
| Header missing or wrong | `401` with `WWW-Authenticate: Bearer realm="mcp"` |
| Header correct | the MCP exchange |

The admin proxy (`src/proxy.ts`) matches only `/admin/**` and `/api/admin/**`, so it never intercepts `/api/mcp`. The bearer check is the only gate: treat the token like a password with full write access to the training data.

## Environment

| Variable | Purpose |
| --- | --- |
| `MCP_TOKEN` | Required. The bearer token. Generate a long random value, e.g. `openssl rand -base64 32`, and set it in Vercel (Production) and in the bot's config. Rotate by changing both. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Already required by the training log (docs/TRAINING-LOG.md). The service role also creates and writes the photo bucket. |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | Already required; used to refresh athlete tokens for every Strava read and write. |

### One-time Strava re-authorization (write access)

The activity tools need the `activity:write` scope on top of `activity:read_all`. Athletes who linked Strava before this change only granted read access, so each of them re-runs the auth script once and leaves both permission boxes ticked:

```bash
npm run strava:auth -- --athlete filippo
npm run strava:auth -- --athlete emir
```

The script always shows the consent page and refuses to save tokens unless both scopes were granted. Until an athlete re-authorizes, `log_activities` and `update_activity` fail for them with a message saying exactly this; reads, the webhook and `resync_strava` keep working.
| `DONORDRIVE_PARTICIPANT_ID` | Optional; without it `get_fundraising` returns placeholder numbers with `live: false`. |

## Conventions

- Every date is `YYYY-MM-DD`. "Today" is America/New_York; `get_overview` returns it, so the bot never has to guess.
- `athlete` is `filippo`, `emir` or `both` (omitted means both). Plan rows with no athletes are shared by both.
- Rest days are dates with no plan rows. There is no rest-day record to create.
- Plan rows follow the same contract as the CSV upload in docs/PLANNING-AGENT.md: `id` defaults to `<date>-<sport>-<slug of title>`, `week` is derived from the date (a supplied week must match), and `phase` defaults to the phase calendar (Base 1, Base 2, Build 1, Build 2, Peak, Taper). Plan dates must fall inside the program, 2026-11-02 to 2027-04-04.
- Results are JSON in a single text content block. Failures come back as `isError: true` with a message the model can act on (for example "has 2 activities on 2026-11-09 ... pass activity_id").
- Every write revalidates the `training` cache tag with `{ expire: 0 }`, so the next visit renders fresh data instead of a stale copy.

## Tools

### Read

**`get_overview`** `{}`
Today's date (America/New_York), race date and days to go, both athletes and whether Strava is linked, plan coverage (first and last date, session count, last update), current program week and phase with its Monday and Sunday, each athlete's sessions planned today, and activity counts (total and last activity date). The bot should call it first in every conversation.

```json
{ "name": "get_overview", "arguments": {} }
```

**`get_fundraising`** `{}`
Raised, goal, percent, donor count and donate link from DonorDrive (cached for a few minutes).

**`list_plan`** `{ from, to, athlete? }`
Planned sessions in an inclusive range of at most 200 days, sorted by date, plus `rest_days` per athlete. With `athlete`, only sessions that apply to that athlete (shared ones included).

```json
{ "name": "list_plan", "arguments": { "from": "2026-11-09", "to": "2026-11-15", "athlete": "filippo" } }
```

**`list_activities`** `{ from, to, athlete? }`
Completed activities in an inclusive range of at most 200 days, newest first, read from the Supabase mirror of Strava: `id` (the Strava activity id), athlete, sport, `sport_type`, name, date, start, moving and elapsed minutes, km, elevation, heart rate, watts, effort, description, photos (`id`, `url`, `caption`) and `strava_url`.

### Plan writes

**`upsert_plan_sessions`** `{ sessions: [...] }`
Create or update up to 200 sessions; never deletes. Each session: `date`, `sport`, `title`, and optionally `detail`, `target_min`, `target_km`, `athlete` (default both), `phase`, `week`, `id`. With `id` it updates that exact row (and can move it to another date, which is how "move Thursday's swim to Friday" works). Without `id` it updates the row with the same date, sport, title and athletes, or creates one. Returns `created`, `updated`, `unchanged` and their ids.

```json
{
  "name": "upsert_plan_sessions",
  "arguments": {
    "sessions": [
      { "id": "2026-11-12-swim-swim-main-set", "date": "2026-11-13", "sport": "swim", "title": "Swim: main set", "target_min": 40, "target_km": 1.4 }
    ]
  }
}
```

**`replace_plan_range`** `{ from, to, athlete?, sessions: [...], dry_run? }`
The main tool for "here is my training for today / this week". Makes the plan for `[from, to]` (at most 62 days) exactly `sessions`: matches are kept or updated in place (by id, then date + sport + title, then a lone same-sport session that day, the same matching the CSV import uses), new sessions are created, and everything else in the range is deleted. An empty `sessions` clears the range. With `athlete` set to one person, only their plan changes: sessions are pinned to them, and a shared session they drop or change is narrowed to the other athlete instead of deleted (reported under `narrows`). `dry_run: true` returns the diff without writing; the bot should always preview first and apply after the user confirms.

```json
{
  "name": "replace_plan_range",
  "arguments": {
    "from": "2026-11-10",
    "to": "2026-11-10",
    "athlete": "filippo",
    "dry_run": true,
    "sessions": [
      { "date": "2026-11-10", "sport": "bike", "title": "Bike: intervals", "detail": "15 min easy, 3 x 10 min sweet spot, 10 min easy", "target_min": 60 }
    ]
  }
}
```

The response lists `summary` (`create`, `update`, `narrow_to_other_athlete`, `delete`, `unchanged`) and the rows in each bucket.

**`delete_plan_sessions`** `{ ids?, from?, to?, athlete?, dry_run? }`
Delete by `ids`, or everything in a range (both `from` and `to`, at most 62 days), or the given ids within the range. An empty filter is refused. With one athlete, shared sessions are narrowed to the other athlete and the other athlete's own sessions are skipped.

```json
{ "name": "delete_plan_sessions", "arguments": { "from": "2026-11-14", "to": "2026-11-14", "athlete": "emir", "dry_run": true } }
```

### Activity writes (through Strava)

These tools write to the athlete's Strava with the token stored in `training.athletes`, then mirror the result with `syncActivity` and revalidate the cache. The webhook later delivers the same change again; the upsert is idempotent. An athlete who has not linked Strava, or linked it without write access, gets an error telling the owner to run `npm run strava:auth -- --athlete <slug>`.

**`log_activities`** `{ activities: [...], allow_duplicates? }`
Creates up to 25 unrecorded sessions as manual activities on Strava (`POST /activities`). Each: `athlete` (`both` creates one activity on each athlete's Strava), `sport`, `date` (not in the future), `duration_min` (required; Strava stores it as elapsed and moving time), and optionally `sport_type` (an exact Strava sport type such as `VirtualRide`, overriding the sport default `Swim`, `Ride`, `Run`, `WeightTraining` or `Workout`), `start_time` (`HH:MM` local wall clock, default 12:00), `name`, `description`, `distance_km`, `trainer`, `commute`. Strava's manual activities cannot hold heart rate, power or elevation, so the tool does not take them; the bot puts such numbers in the description if the athlete mentions them.

- Everything is validated, and each athlete's Strava link checked, before the first request.
- If the athlete already has an activity of the same sport that day, nothing is created and the clashes are listed, unless `allow_duplicates: true` (Strava activities cannot be deleted through the API, so a duplicate would need a trip to the Strava app).
- Sessions are created one at a time. Before each, the call stops if fewer than 10 Strava requests remain in the rate-limit window; on the first failure it also stops. `stopped_early` then lists what was not logged.
- Returns `logged`, `requested`, the new Strava `ids`, the mirrored `activities`, `sync_errors` (created on Strava but not yet mirrored; the webhook or `resync_strava` fixes those) and `warnings`.

```json
{
  "name": "log_activities",
  "arguments": {
    "activities": [
      { "athlete": "filippo", "sport": "strength", "date": "2026-11-09", "start_time": "18:30", "name": "Knee rehab A", "duration_min": 40, "description": "Spanish squats, split squats, step-downs. Knee felt fine." }
    ]
  }
}
```

**`update_activity`** `{ id, fields }`
Edits one activity on Strava (`PUT /activities/{id}`) and re-mirrors it. `fields` holds exactly what Strava's `UpdatableActivity` allows: `name`, `description` (`null` or `""` clears it), `sport` (sends the default sport type, and only if the sport actually changes, so a `VirtualRide` stays virtual), `sport_type` (exact, takes priority), `trainer`, `commute`, `hide_from_home`. Date, start time, duration, distance, heart rate and power cannot be changed through Strava's API; the athlete edits those in the Strava app and the webhook brings the change in.

```json
{ "name": "update_activity", "arguments": { "id": "16123456789", "fields": { "name": "Brick: ride + 15 min run", "description": "Legs heavy off the bike." } } }
```

**`delete_activity`** `{ id }`
Deletes nothing. Strava's public API has no delete endpoint, and removing the row here would only make the site drift from Strava until the next sync. The tool returns the activity, its `strava_url` and instructions to delete it in the Strava app or website (Actions menu, then Delete). Once that happens, the webhook's `delete` event removes the row and any photos uploaded to it. It is kept as a tool (rather than removed) so the bot has a definite answer and a link to give when an athlete asks to delete something.

**`resync_strava`** `{ athlete?, since?, budget? }`
Runs the same `syncAthlete` as the cron for the chosen athletes (default both, since 2026-11-02). `budget` (default 10, max 25 per athlete) caps the full detail and photo fetches so the call fits the route's 60 second limit; anything beyond is stored as a summary and detailed by the next run.

### Photos

**`add_photo`** `{ athlete, activity_id?, date?, image_url?, image_base64?, mime_type?, caption? }`
Stores one photo and appends it to the activity's photo strip on `/training`.

- Photos stay on this server: Strava's API cannot upload photos. They are keyed by the Strava activity id, and the target must already be in the mirror (any positive Strava id that `list_activities` returns).
- Target: `activity_id`, or `athlete` + `date` to use that athlete's only activity that day. Several activities that day is an error listing them; none is an error suggesting `log_activities` (or `resync_strava`) first.
- Image: exactly one of `image_url` or `image_base64`.
  - `image_url` is fetched by the server (20 second timeout, http or https, public hosts only). A Telegram bot can pass the file URL it gets from `getFile` (`https://api.telegram.org/file/bot<token>/<file_path>`); the URL is never stored or echoed back, only the image.
  - `image_base64` takes raw base64 or a `data:image/...;base64,` URL. Vercel caps request bodies at 4.5 MB, so base64 only works for images up to about 3 MB; send larger files by URL.
- Accepted: JPEG, PNG, WebP, HEIC, up to 15 MB. The type is detected from the file's bytes, not trusted from `mime_type`. Pixel size is read from the header (EXIF rotation aware) so the photo strip keeps the right aspect ratio. HEIC is stored as is, but most browsers cannot display it, so JPEG is preferred.
- Storage: Supabase Storage bucket `training-photos` (public, created on first use by the service-role client), path `<athlete>/<activity id>/upload-<uuid>.<ext>`. `next.config.ts` allows that path for `next/image`.
- Uploaded photo ids start with `upload-`. When Strava resyncs an activity, `upsertActivity` carries these over, so Strava's photo list does not wipe them.

```json
{
  "name": "add_photo",
  "arguments": { "athlete": "filippo", "date": "2026-11-08", "image_url": "https://api.telegram.org/file/bot<token>/photos/file_12.jpg", "caption": "Long run, mile 6" }
}
```

**`remove_photo`** `{ activity_id, photo_id }`
Removes one photo from the activity and deletes the stored file if it was uploaded here. A Strava photo comes back on the next detail sync unless it is removed on Strava.

## Connecting a Grok bot (xAI API)

xAI documents remote MCP tools at <https://docs.x.ai/docs/guides/tools/remote-mcp-tools>. At the time of writing that page describes the following (check it before relying on a field):

- Remote MCP servers are attached as tools on the **Responses API** (`POST https://api.x.ai/v1/responses`) or through the xAI SDK's `mcp()` helper. Only Streamable HTTP and SSE transports are supported; this server is Streamable HTTP.
- Tool object fields: `type: "mcp"` (required), `server_url` (required), `server_label` (required; prefixes the tool names the model sees), `server_description` (optional), `allowed_tools` (optional allowlist; empty or omitted allows every tool), `authorization` (optional; "a token that will be set in the Authorization header" of requests to the MCP server) and `headers` (optional extra headers). In the xAI Python SDK the allowlist and headers are named `allowed_tool_names` and `extra_headers`.
- `require_approval` and `connector_id` are not supported, so the bot must ask the user for confirmation itself (the system prompt in docs/GROK-BOT-PROMPT.md tells it to).

The docs do not say whether `authorization` expects the bare token or the full `Bearer ...` value. This server accepts both, so either works. If in doubt, send the header explicitly with `headers` (`extra_headers` in the SDK).

```bash
curl https://api.x.ai/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-4.7",
    "instructions": "<paste docs/GROK-BOT-PROMPT.md here>",
    "input": [{ "role": "user", "content": "Today I swam 2 km in 42 minutes, not on Strava." }],
    "tools": [{
      "type": "mcp",
      "server_url": "https://race-against-heart-disease.vercel.app/api/mcp",
      "server_label": "training",
      "server_description": "Training plan, activity log, photos and fundraising for Filippo and Emir (IRONMAN 70.3 Texas).",
      "authorization": "'"$MCP_TOKEN"'"
    }]
  }'
```

Python with the OpenAI-compatible client:

```python
from openai import OpenAI

client = OpenAI(api_key=os.environ["XAI_API_KEY"], base_url="https://api.x.ai/v1")
response = client.responses.create(
    model="grok-4.7",
    instructions=SYSTEM_PROMPT,  # docs/GROK-BOT-PROMPT.md
    input=[{"role": "user", "content": user_message}],
    tools=[{
        "type": "mcp",
        "server_url": "https://race-against-heart-disease.vercel.app/api/mcp",
        "server_label": "training",
        "headers": {"Authorization": f"Bearer {os.environ['MCP_TOKEN']}"},
    }],
)
```

The model name in the examples is the one the xAI docs use; any Grok model with tool calling works.

**Photos from Telegram.** When the athlete sends a photo, the bot calls Telegram's `getFile` for the largest size, builds the file URL, and passes it to `add_photo` as `image_url` together with the athlete and the date (or activity id). The URL contains the bot token: it only travels to this server over HTTPS and is never stored or returned.

## Testing it by hand

```bash
# 401
curl -i -X POST https://race-against-heart-disease.vercel.app/api/mcp -H 'content-type: application/json' -d '{}'

# initialize, then list tools
H=(-H "authorization: Bearer $MCP_TOKEN" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream')
curl -s -X POST https://race-against-heart-disease.vercel.app/api/mcp "${H[@]}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
curl -s -X POST https://race-against-heart-disease.vercel.app/api/mcp "${H[@]}" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
curl -s -X POST https://race-against-heart-disease.vercel.app/api/mcp "${H[@]}" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_overview","arguments":{}}}'
```

Responses arrive as a one-event SSE stream (`event: message` / `data: {...}`). The MCP Inspector (`npx @modelcontextprotocol/inspector`) also works: choose Streamable HTTP and add the Authorization header.

## Limits and caveats

- Ranges: lists up to 200 days; replace and ranged delete up to 62 days; 200 sessions per upsert, 300 per replace, 25 activities per log call (each costs about three Strava requests: create, detail, and a token refresh now and then).
- The route's `maxDuration` is 60 seconds, the same as the Strava cron route.
- Strava is the source of truth for activities. The mirror is only a cache filled from Strava (webhook, cron, backfill, and the immediate resync after an MCP write); nothing writes activity rows any other way. Removing a Strava photo here is undone by the next detail sync unless it is removed on Strava too. Uploaded photos and the plan are never touched by Strava.
- `get_overview` counts activities from one query, so counts cap at Supabase's 1000-row page; that is several seasons of training for two athletes.
