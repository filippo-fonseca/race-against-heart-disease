# MCP server (Grok bot control)

The site runs a remote [Model Context Protocol](https://modelcontextprotocol.io) server so the owner's Grok bot can read and edit the training backend: the plan, the activity log, session photos, the Strava sync and the fundraising total. Everything the bot writes shows up on `/training` and the homepage on the next page load.

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
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | Already required; used by `resync_strava`. |
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
Today's date (America/New_York), race date and days to go, both athletes and whether Strava is linked, plan coverage (first and last date, session count, last update), current program week and phase with its Monday and Sunday, each athlete's sessions planned today, and activity counts (Strava vs manual, last activity date). The bot should call it first in every conversation.

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
Completed activities in an inclusive range of at most 200 days, newest first: `id`, `source` (`strava` or `manual`), athlete, sport, name, date, start, moving and elapsed minutes, km, elevation, heart rate, watts, effort, description, and photos (`id`, `url`, `caption`).

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

### Activity writes

**`log_activities`** `{ activities: [...] }`
Record up to 50 sessions that are not on Strava. Each: `athlete` (`both` logs one row per athlete), `sport`, `date` (not in the future), `moving_time_min` (required), and optionally `start_time` (`HH:MM`, America/New_York; default 12:00), `name`, `description`, `elapsed_time_min`, `distance_km`, `elevation_m`, `avg_hr`, `max_hr`, `avg_watts`. Returns the new ids and warnings when the same athlete already has an activity of that sport on that day.

```json
{
  "name": "log_activities",
  "arguments": {
    "activities": [
      { "athlete": "filippo", "sport": "strength", "date": "2026-11-09", "start_time": "18:30", "name": "Knee rehab A", "moving_time_min": 40, "description": "Spanish squats, split squats, step-downs. Knee felt fine." }
    ]
  }
}
```

Manual rows live in `training.activities` with **negative ids** (minted from the clock plus a random suffix), so they can never collide with Strava's positive ids, the Strava sync never touches them, and `id < 0` marks them as manual everywhere (`source: "manual"` in tool output). No schema change is needed. The row's `raw` column records `{ "source": "manual", "via": "mcp" }`. If an athlete has no row in `training.athletes` yet (Strava never linked), a bare row is created so the foreign key holds.

**`update_activity`** `{ id, fields }`
Change `name`, `description`, `sport`, `date`, `start_time`, `moving_time_min`, `elapsed_time_min`, `distance_km`, `elevation_m`, `avg_hr`, `max_hr`, `avg_watts`. Only given fields change; `null` clears description, heart rate or watts. On a Strava activity the edit holds until the activity is edited on Strava: the webhook then re-fetches it and Strava's values win.

```json
{ "name": "update_activity", "arguments": { "id": "16123456789", "fields": { "name": "Brick: ride + 15 min run", "description": "Legs heavy off the bike." } } }
```

**`delete_activity`** `{ id }`
Deletes the row and any photos uploaded to it. A deleted Strava activity comes back on the next sync unless it is also deleted on Strava, so this is mainly for manual entries.

**`resync_strava`** `{ athlete?, since?, budget? }`
Runs the same `syncAthlete` as the cron for the chosen athletes (default both, since 2026-11-02). `budget` (default 10, max 25 per athlete) caps the full detail and photo fetches so the call fits the route's 60 second limit; anything beyond is stored as a summary and detailed by the next run.

### Photos

**`add_photo`** `{ athlete, activity_id?, date?, image_url?, image_base64?, mime_type?, caption? }`
Stores one photo and appends it to the activity's photo strip on `/training`.

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

- Ranges: lists up to 200 days; replace and ranged delete up to 62 days; 200 sessions per upsert, 300 per replace, 50 activities per log call.
- The route's `maxDuration` is 60 seconds, the same as the Strava cron route.
- Strava is the source of truth for Strava activities: edits, deletes and photo removals made here can be undone by Strava's own webhook or sync. Manual activities and uploaded photos are never touched by Strava.
- `get_overview` counts activities from one query, so counts cap at Supabase's 1000-row page; that is several seasons of training for two athletes.
