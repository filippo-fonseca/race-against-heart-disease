# MCP server (Grok bot control)

The site runs a remote [Model Context Protocol](https://modelcontextprotocol.io) server so the owner's Grok bot can keep Filippo's training log accurate. The bot does three things and nothing else: it **logs and edits Strava activities**, it **attaches photos** to them, and it reads (the overview, the activity list, the fundraising total). There is no training plan and no second athlete: the site is a retroactive log of what Filippo did, from day 1 (November 2, 2026) to race day (April 4, 2027). Everything the bot writes shows up on `/training` and the homepage on the next page load.

- **URL:** `https://www.againstheartdisease.xyz/api/mcp` (the `race-against-heart-disease.vercel.app` address works too)
- **Transport:** Streamable HTTP, stateless (each POST is a complete JSON-RPC exchange; no sessions). Built on `mcp-handler` 2.3.0 and `@modelcontextprotocol/server` 2.3.1, so it answers both the 2025-era protocol (`2025-06-18` and earlier Streamable HTTP clients) and the 2026-07-28 revision.
- **Code:** route `src/app/api/mcp/route.ts`; tool registry `src/lib/mcp/server.ts`; tool bodies in `src/lib/mcp/activity-tools.ts`, `photo-tools.ts`, `overview.ts`; pure logic (tested) in `activity-logic.ts`, `photo-edit.ts`, `photo-logic.ts`, `validate.ts`, `auth.ts`; tests in `src/lib/mcp/__tests__/` and `src/lib/training/__tests__/` (`strava.test.ts`, `sync.test.ts`).

## Architecture: one-way data flow from Strava

**Strava is the single source of truth for activities.** Data flows one way, Strava to the Supabase mirror to the site. The `training.activities` table is only a cache filled from Strava (the webhook, the cron, the backfill script, and the immediate resync after an MCP write). Nothing writes activity data any other way, so the site cannot drift from Strava. When the bot logs or edits an activity, it calls the Strava API with Filippo's token, and the change comes back down the same path as a workout recorded on a watch.

```
              Grok bot (MCP tools)
              log_activities / update_activity
                         |
                         | Strava API (activity:write)
                         v
  watch, Strava app --> [ STRAVA ] --------------------------------+
                         |                                         |
         webhook: create, update, delete       cron, backfill, resync_strava,
                         |                     immediate resync after a write
                         v                                         |
            /api/strava/webhook, sync.ts  <------------------------+
                         |
                         v
          Supabase training.activities   (read-only cache of Strava)
                         |
                         v
          /training and the homepage

  Local only (Strava's API has no way to hold it):
    photos added by the bot  <-- add_photo / update_photo / remove_photo
                                 (Supabase Storage, listed in the activity's
                                  photos next to the synced Strava photos)
```

- Deleting an activity happens only in the Strava app: Strava's API has no delete endpoint. The webhook's `delete` event then removes the row and any photos the bot added to it.
- **Photos.** Photos the bot adds show on the website next to the activity, but they do not appear inside the Strava app (Strava's API cannot upload photos). Photos added in the Strava app show on the site automatically: every sync pulls them in. Both kinds sit in the activity's `photos` list (Strava's first, then the bot's), and a resync rewrites only the Strava part, so it never drops the bot's photos, their captions or their order. Writes to that list use optimistic concurrency on `updated_at`, so a photo saved at the same moment as a webhook resync is not lost.

## Auth

Every request needs `Authorization: Bearer <MCP_TOKEN>`. The comparison is constant time (`src/lib/safe-equal.ts`). A bare token as the whole header value is also accepted, for clients that put only the token in the `authorization` field. For connector UIs that only take a URL, the token can instead go in a `key` query parameter (`/api/mcp?key=<MCP_TOKEN>`); the header wins when both are present. That URL then carries the secret, so keep it private (it can appear in Vercel's request logs).

| Situation | Response |
| --- | --- |
| `MCP_TOKEN` unset in the environment | `503`, the server does nothing (never open) |
| Header missing or wrong | `401` with `WWW-Authenticate: Bearer realm="mcp"` |
| Header correct | the MCP exchange |

The admin proxy (`src/proxy.ts`) matches only `/admin/**` and `/api/admin/**`, so it never intercepts `/api/mcp`. The bearer check is the only gate: treat the token like a password with write access to Filippo's Strava activities.

## Environment

| Variable | Purpose |
| --- | --- |
| `MCP_TOKEN` | Required. The bearer token. Generate a long random value, e.g. `openssl rand -base64 32`, and set it in Vercel (Production) and in the bot's config. Rotate by changing both. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Already required by the training log. The service role also creates and writes the photo bucket. |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | Already required; used to refresh Filippo's token for every Strava read and write. |
| `DONORDRIVE_PARTICIPANT_ID` | Optional; without it `get_fundraising` returns placeholder numbers with `live: false`. |

### One-time Strava re-authorization (write access)

The activity tools need the `activity:write` scope on top of `activity:read_all`. A Strava link made before this change only granted read access, so run the auth script once more and leave both permission boxes ticked:

```bash
npm run strava:auth
```

The script always shows the consent page and refuses to save tokens unless both scopes were granted. Until then `log_activities` and `update_activity` fail with a message saying exactly this; reads, photos, the webhook and `resync_strava` keep working.

## Conventions

- Every date is `YYYY-MM-DD`. "Today" is America/New_York; `get_overview` returns it, so the bot never has to guess.
- Activity ids are Strava activity ids (positive integers), the same ids `list_activities` returns.
- Sport buckets are exactly four: `swim`, `bike`, `run` and `strength` (shown as LIFT on the site). Indoor rides (a Ride with `trainer`, or a VirtualRide) are bike; HIIT, weights and anything that is not swim, bike or run is strength.
- Results are JSON in a single text content block. Failures come back as `isError: true` with a message the model can act on.
- Every write revalidates the `training` cache tag with `{ expire: 0 }`, so the next visit renders fresh data instead of a stale copy.

## Tools

### Read

**`get_overview`** `{}`
Today's date (America/New_York), race date and days to go, the training window (`start` 2026-11-02 is day 1, `race_day` 2027-04-04; today's `day_number`, `total_days`, `days_to_race` and a `status` line), whether Strava is linked, and totals since day 1: activity count, last activity date, and per bucket (`swim`, `bike`, `run`, `strength` with label LIFT) the sessions, hours and km. The bot should call it first in every conversation.

**`get_fundraising`** `{}`
Raised, goal, percent, donor count and donate link from DonorDrive (cached for a few minutes).

**`list_activities`** `{ from, to }`
Activities in an inclusive range of at most 200 days, newest first, read from the mirror of Strava: `id`, `sport` (bucket), `sport_label`, `sport_type` (Strava's), name, date, start, moving and elapsed minutes, km, elevation, heart rate, watts, effort, description, `strava_url`, and `photos`. Each photo has `id`, `position`, `source` (`strava`: synced from the Strava app, read-only here; `mcp`: added by the bot, editable), `editable`, `url`, `caption`, `width`, `height`.

### Activity writes (through Strava)

These tools write to Filippo's Strava with the token stored in `training.athletes`, then mirror the result with `syncActivity` and revalidate the cache. The webhook later delivers the same change again; the write is idempotent. Without Strava write access they fail with the `npm run strava:auth` instruction.

**`log_activities`** `{ activities: [...], allow_duplicates? }`
Creates up to 25 unrecorded sessions as manual activities on Strava (`POST /activities`). Each: `sport` (bucket), `date` (not in the future), `duration_min` (required; Strava stores it as elapsed and moving time), and optionally `sport_type`, `start_time` (`HH:MM` local wall clock, default 12:00), `name`, `description`, `distance_km`, `trainer`, `commute`.

- Default Strava types per bucket: swim `Swim`, bike `Ride`, run `Run`, strength `HighIntensityIntervalTraining`. An explicit `sport_type` wins (for example `WeightTraining` or `Crossfit` for strength, `VirtualRide` for Zwift). An indoor ride is `bike` with `trainer: true`. For bike, time matters more than distance, so distance is optional.
- Strava's manual activities cannot hold heart rate, power or elevation, so the tool does not take them; the bot puts such numbers in the description.
- Everything is validated, and the Strava link checked, before the first request.
- A same-day activity in the same bucket blocks the call (nothing is created; the clashes are listed) unless `allow_duplicates: true`, because a duplicate could only be removed in the Strava app.
- Sessions are created one at a time. The call stops before a session if fewer than 10 Strava requests remain in the rate-limit window, and on the first failure; `stopped_early` lists what was not logged.
- Returns `logged`, `requested`, the new Strava `ids`, the mirrored `activities`, `sync_errors` (created on Strava but not yet mirrored; the webhook or `resync_strava` fixes those) and `warnings`.

```json
{
  "name": "log_activities",
  "arguments": {
    "activities": [
      { "sport": "strength", "date": "2026-11-09", "start_time": "18:30", "name": "HIIT circuit", "duration_min": 40, "description": "5 rounds: burpees, kettlebell swings, box jumps." },
      { "sport": "bike", "date": "2026-11-08", "trainer": true, "duration_min": 75, "name": "Zwift endurance" }
    ]
  }
}
```

**`update_activity`** `{ id, fields }`
Edits one activity on Strava (`PUT /activities/{id}`) and re-mirrors it. `fields` holds exactly what Strava's `UpdatableActivity` allows: `name`, `description` (`null` or `""` clears it), `sport` (sends the bucket's default type, and only if the bucket actually changes, so a VirtualRide stays virtual and WeightTraining stays weights), `sport_type` (exact, takes priority), `trainer`, `commute`, `hide_from_home`. Date, start time, duration, distance, heart rate and power cannot be changed through Strava's API; they are edited in the Strava app and the webhook brings the change in.

```json
{ "name": "update_activity", "arguments": { "id": "16123456789", "fields": { "name": "Brick: ride + 15 min run", "description": "Legs heavy off the bike." } } }
```

**`delete_activity`** `{ id }`
Deletes nothing. Strava's public API has no delete endpoint, and removing the row here would only make the site drift from Strava. The tool returns the activity, its `strava_url` and instructions to delete it in the Strava app or website (Actions menu, then Delete); the webhook's `delete` event then removes it and the bot's photos. It is kept as a tool so the bot has a definite answer and a link when asked to delete something.

**`resync_strava`** `{ since?, budget? }`
Runs the same `syncAthlete` as the cron (default since 2026-11-02). `budget` (default 20, max 40) caps the full detail and photo fetches so the call fits the route's 60 second limit; anything beyond is stored as a summary and detailed by the next run.

### Photos

Photos the bot adds show on the website next to the activity; they do not appear inside the Strava app. Photos added in the Strava app show on the site automatically and are read-only here.

**`add_photo`** `{ activity_id?, date?, sport?, image_url?, image_base64?, mime_type?, caption? }`
Stores one photo and appends it to the activity's photos.

- Target: `activity_id` (a Strava id), or `date` plus optional `sport` bucket to use the only matching activity that day. When zero or several activities match, nothing is stored: the result is `{ attached: false, reason, candidates }` so the bot can ask (or log or resync the session first) and call again with `activity_id`.
- Image: exactly one of `image_url` or `image_base64`.
  - `image_url` is fetched by the server (20 second timeout, http or https, public hosts only). A Telegram bot can pass the file URL it gets from `getFile` (`https://api.telegram.org/file/bot<token>/<file_path>`); the URL is never stored or echoed back, only the image.
  - `image_base64` takes raw base64 or a `data:image/...;base64,` URL. Vercel caps request bodies at 4.5 MB, so base64 only works for images up to about 3 MB; send larger files by URL.
- Accepted: JPEG, PNG, WebP, HEIC, up to 15 MB. The type is detected from the file's bytes, not trusted from `mime_type`. Pixel size is read from the header (EXIF rotation aware) so the photo strip keeps the right aspect ratio. HEIC is stored as is, but most browsers cannot display it, so JPEG is preferred.
- Storage: Supabase Storage bucket `training-photos` (public, created on first use by the service-role client), path `<athlete>/<activity id>/upload-<uuid>.<ext>`. `next.config.ts` allows that path for `next/image`. Photo ids start with `upload-`.

```json
{
  "name": "add_photo",
  "arguments": { "date": "2026-11-08", "sport": "run", "image_url": "https://api.telegram.org/file/bot<token>/photos/file_12.jpg", "caption": "Long run, mile 6" }
}
```

**`update_photo`** `{ activity_id, photo_id?, caption?, image_url?, image_base64?, mime_type?, order? }`
Edits photos the bot added (source `mcp`). Any combination of: a new `caption` for `photo_id` (`null` or `""` clears it); a new image for `photo_id` (the photo gets a new `upload-` id in the same position, keeps its caption unless a new one is given, and the old file is deleted); and `order`, every added photo id of the activity in the new order. Strava photos are read-only: they always come first, in Strava's order, and are changed only in the Strava app. Returns the activity's full photo list.

**`remove_photo`** `{ activity_id, photo_id }`
Removes one photo the bot added and deletes its file. Strava photos are refused (remove them in the Strava app; the site follows).

## Connecting the Grok app (grok.com)

This is the quickest way to talk to the bot from your phone or browser. xAI documents custom connectors at <https://docs.x.ai/grok/connectors>: grok.com/connectors, **New Connector**, **Custom**, then the server URL and any authentication.

1. **Server URL.** The docs don't say whether the custom connector form has a field for a token. Use whichever form fits:
   - If the form has an API key, token or header field: URL `https://www.againstheartdisease.xyz/api/mcp`, with the token being `MCP_TOKEN` (bare, or as `Bearer <token>`).
   - If it only takes a URL: `https://www.againstheartdisease.xyz/api/mcp?key=<MCP_TOKEN>`. The server accepts the token as a `key` query parameter for exactly this case. Treat that URL like a password: anyone with it can edit the training log.
2. **Name** the connector `training`, so the tool names match the bot prompt.
3. **Instructions.** Make a Grok Project (or use custom instructions) and paste everything below the line in `docs/GROK-BOT-PROMPT.md` as its instructions. Chat inside that project so the instructions and the connector are both active.
4. **Hand the setup check to Grok.** Send the setup message below as the first chat in the project. Grok tests the connection itself and reports back.

### Setup message for Grok

```text
You're connected to my training backend through the "training" connector. Before anything else, check the connection yourself:
1. Call get_overview and tell me today's day number in the training window (Nov 2 is day 1, Apr 4 is race day), the days to race, whether Strava is linked, and my totals per sport (SWIM, RUN as distance; BIKE, LIFT as time).
2. Call list_activities for the last 7 days and give me a one-line summary per activity.
3. Call get_fundraising and tell me the total.
If any call fails, show me the exact error and what you think it means (401 = wrong token or URL, 503 = MCP_TOKEN not set on the server). Don't create, edit or delete anything during this check. When all three work, reply "Connected" and remind me how to send sessions and photos.
```

**Photos in the Grok app.** If Grok can't pass a photo you upload in chat as a public URL, send it as base64 (`image_base64`, about 3 MB at most) or share a link to the image, and let `add_photo` fetch it.

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
    "input": [{ "role": "user", "content": "Did 40 min of HIIT at the gym today, did not record it." }],
    "tools": [{
      "type": "mcp",
      "server_url": "https://race-against-heart-disease.vercel.app/api/mcp",
      "server_label": "training",
      "server_description": "Filippo's Strava activities, session photos and fundraising (IRONMAN 70.3 Texas).",
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

**Photos from Telegram.** When Filippo sends a photo, the bot calls Telegram's `getFile` for the largest size, builds the file URL, and passes it to `add_photo` as `image_url` together with the activity id (or the date and sport). The URL contains the bot token: it only travels to this server over HTTPS and is never stored or returned.

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

- Ranges: `list_activities` up to 200 days; 25 sessions per `log_activities` call (each costs about three Strava requests: create, detail, and a token refresh now and then).
- The route's `maxDuration` is 60 seconds, the same as the Strava cron route.
- Strava's API cannot delete activities, change their date, duration, distance, heart rate or power, or upload photos. Those changes happen in the Strava app and reach the site through the webhook (photos added in the app included).
- `get_overview` totals come from one query, so they cap at Supabase's 1000-row page; that is far more than one season of training.

