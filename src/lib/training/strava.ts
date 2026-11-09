import type { Activity, ActivityPhoto, AthleteSlug } from "./types";
import { toSport } from "./types";
import { saveAthleteTokens, type AthleteRow } from "./db";

/**
 * Typed Strava v3 client. Only the handful of endpoints the training log
 * needs. Every call goes through `stravaFetch`, which records the rate-limit
 * headers so `sync.ts` can stop before Strava starts returning 429s.
 *
 * Strava is the source of truth for activities: the site only reads them
 * (through the Supabase mirror), and the MCP tools write through
 * `createActivity` / `updateActivity` here, never to the mirror directly.
 */

export const STRAVA_API = "https://www.strava.com/api/v3";
export const STRAVA_OAUTH = "https://www.strava.com/oauth";
/** Every scope the app needs: read (including private) and write activities. */
export const STRAVA_SCOPES = ["activity:read_all", "activity:write"] as const;
/** Comma-separated form Strava's authorize URL expects. */
export const STRAVA_SCOPE = STRAVA_SCOPES.join(",");

/**
 * Required scopes missing from the `scope` Strava echoes back on the OAuth
 * redirect (a comma-separated list of what the athlete actually ticked).
 */
export function missingScopes(granted: string | null | undefined): string[] {
  const have = new Set(
    (granted ?? "")
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return STRAVA_SCOPES.filter((s) => !have.has(s));
}

// Payload shapes (subset of the Strava API reference).

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  /** Unix seconds. */
  expires_at: number;
}

export interface StravaAthleteSummary {
  id: number;
  firstname: string;
  lastname: string;
  /** Avatar URL. */
  profile: string | null;
}

export interface StravaTokenResponse extends StravaTokens {
  athlete?: StravaAthleteSummary;
}

export interface StravaPhotoUrls {
  [size: string]: string;
}

export interface StravaPhoto {
  unique_id: string;
  caption?: string | null;
  source?: number;
  urls?: StravaPhotoUrls;
  /** `{ "1200": [width, height] }` */
  sizes?: Record<string, [number, number]>;
}

export interface StravaSummaryActivity {
  id: number;
  name: string;
  sport_type: string;
  type?: string;
  /** UTC instant, e.g. "2026-11-02T11:30:00Z". */
  start_date: string;
  /** Local wall-clock time with a misleading "Z", e.g. "2026-11-02T06:30:00Z". */
  start_date_local: string;
  /** Seconds east of UTC. */
  utc_offset: number;
  timezone?: string;
  moving_time: number;
  elapsed_time: number;
  distance: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  suffer_score?: number | null;
  total_photo_count?: number;
}

export interface StravaDetailedActivity extends StravaSummaryActivity {
  description?: string | null;
  photos?: {
    count: number;
    primary?: StravaPhoto | null;
  };
}

export interface StravaRateLimit {
  /** [15-minute, daily] request limits. */
  limit: [number, number];
  /** [15-minute, daily] usage so far. */
  usage: [number, number];
}

export class StravaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "StravaError";
  }
}

/**
 * Strava refused a write (401/403). With a freshly refreshed token that
 * almost always means the athlete authorized before the app asked for
 * `activity:write`, or revoked access; re-running the auth script fixes both.
 */
export class StravaWriteAccessError extends StravaError {
  constructor(status: number, body: string) {
    super(
      `Strava refused the write (HTTP ${status}): the stored token lacks activity:write permission or was revoked. ` +
        "Re-run `npm run strava:auth -- --athlete <slug>` to grant write access.",
      status,
      body,
    );
    this.name = "StravaWriteAccessError";
  }
}

let lastRateLimit: StravaRateLimit | null = null;

/** Rate-limit state from the most recent Strava response, if any. */
export function getRateLimit(): StravaRateLimit | null {
  return lastRateLimit;
}

/** True when fewer than `margin` requests remain in the 15-minute window. */
export function nearRateLimit(margin = 10): boolean {
  if (!lastRateLimit) return false;
  const [shortLimit, dailyLimit] = lastRateLimit.limit;
  const [shortUsed, dailyUsed] = lastRateLimit.usage;
  return shortLimit - shortUsed < margin || dailyLimit - dailyUsed < margin;
}

function parsePair(value: string | null): [number, number] | null {
  if (!value) return null;
  const [a, b] = value.split(",").map((s) => Number(s.trim()));
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

function recordRateLimit(headers: Headers) {
  const limit = parsePair(headers.get("x-ratelimit-limit"));
  const usage = parsePair(headers.get("x-ratelimit-usage"));
  if (limit && usage) lastRateLimit = { limit, usage };
}

function clientCredentials() {
  const id = process.env.STRAVA_CLIENT_ID;
  const secret = process.env.STRAVA_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("Strava is not configured: set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET.");
  }
  return { client_id: id, client_secret: secret };
}

async function stravaFetch<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...rest } = init;
  const url = path.startsWith("http") ? path : `${STRAVA_API}${path}`;
  const headers = new Headers(rest.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(url, { ...rest, headers, cache: "no-store" });
  recordRateLimit(res.headers);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new StravaError(`Strava ${rest.method ?? "GET"} ${path} failed: ${res.status}`, res.status, body);
  }
  return (await res.json()) as T;
}

// OAuth

/** Consent URL for the local auth script. */
export function authorizeUrl(redirectUri: string): string {
  const { client_id } = clientCredentials();
  const params = new URLSearchParams({
    client_id,
    response_type: "code",
    redirect_uri: redirectUri,
    // Always show the consent page so an athlete who granted read-only
    // access earlier is asked again for activity:write.
    approval_prompt: "force",
    scope: STRAVA_SCOPE,
  });
  return `${STRAVA_OAUTH}/authorize?${params}`;
}

export async function exchangeCode(code: string): Promise<StravaTokenResponse> {
  return stravaFetch<StravaTokenResponse>(`${STRAVA_OAUTH}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...clientCredentials(), grant_type: "authorization_code", code }),
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<StravaTokens> {
  const data = await stravaFetch<StravaTokenResponse>(`${STRAVA_OAUTH}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...clientCredentials(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
}

/**
 * Access token for an athlete, refreshed when it expires within a minute.
 * Strava rotates refresh tokens, so the new set is persisted immediately.
 */
export async function getValidToken(athlete: AthleteRow): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (athlete.access_token && athlete.expires_at && athlete.expires_at - 60 > now) {
    return athlete.access_token;
  }
  if (!athlete.refresh_token) {
    throw new Error(`Athlete ${athlete.slug} has no Strava refresh token; run strava:auth.`);
  }
  const tokens = await refreshAccessToken(athlete.refresh_token);
  await saveAthleteTokens(athlete.slug, tokens);
  athlete.access_token = tokens.access_token;
  athlete.refresh_token = tokens.refresh_token;
  athlete.expires_at = tokens.expires_at;
  return tokens.access_token;
}

// Activities

/** One page of the athlete's activities started after `after`. */
export async function listActivities(
  token: string,
  opts: { after: Date; page?: number; perPage?: number },
): Promise<StravaSummaryActivity[]> {
  const params = new URLSearchParams({
    after: String(Math.floor(opts.after.getTime() / 1000)),
    page: String(opts.page ?? 1),
    per_page: String(opts.perPage ?? 100),
  });
  return stravaFetch<StravaSummaryActivity[]>(`/athlete/activities?${params}`, { token });
}

export async function getActivityDetail(
  token: string,
  id: number | string,
): Promise<StravaDetailedActivity> {
  return stravaFetch<StravaDetailedActivity>(
    `/activities/${id}?include_all_efforts=false`,
    { token },
  );
}

export async function getActivityPhotos(
  token: string,
  id: number | string,
): Promise<StravaPhoto[]> {
  return stravaFetch<StravaPhoto[]>(
    `/activities/${id}/photos?size=1200&photo_sources=true`,
    { token },
  );
}

/**
 * Detail plus photos. The photos endpoint is only called when the detail says
 * there are any; a photo fetch failure falls back to the primary photo.
 */
export async function getActivity(
  token: string,
  id: number | string,
): Promise<{ detail: StravaDetailedActivity; photos: ActivityPhoto[] }> {
  const detail = await getActivityDetail(token, id);
  const count = detail.photos?.count ?? detail.total_photo_count ?? 0;
  let photos: ActivityPhoto[] = [];
  if (count > 0) {
    try {
      photos = (await getActivityPhotos(token, id)).map(toPhoto).filter((p) => p.url);
    } catch (err) {
      console.warn(`strava: photos for ${id} failed, using primary`, err);
    }
    if (photos.length === 0 && detail.photos?.primary) {
      const primary = toPhoto(detail.photos.primary);
      if (primary.url) photos = [primary];
    }
  }
  return { detail, photos };
}

/** Largest available rendition of a Strava photo. */
function toPhoto(photo: StravaPhoto): ActivityPhoto {
  const urls = photo.urls ?? {};
  const sizes = Object.keys(urls).sort((a, b) => Number(b) - Number(a));
  const best = sizes[0];
  const dims = best ? photo.sizes?.[best] : undefined;
  return {
    id: photo.unique_id,
    url: best ? urls[best] : "",
    width: dims?.[0] ?? null,
    height: dims?.[1] ?? null,
    caption: photo.caption?.trim() ? photo.caption : null,
  };
}

/** "+05:30" style offset from Strava's `utc_offset` seconds. */
function offsetString(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  const abs = Math.abs(Math.round(seconds));
  const hh = String(Math.floor(abs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/**
 * Normalise a Strava activity (summary or detail) into our `Activity`.
 * `start_date_local` is local wall-clock time wearing a fake "Z", so the date
 * is taken straight from it and the offset is re-attached from `utc_offset`.
 */
export function normalizeActivity(
  athlete: AthleteSlug,
  raw: StravaSummaryActivity | StravaDetailedActivity,
  photos: ActivityPhoto[] = [],
  detailed = false,
): Activity {
  const local = raw.start_date_local.replace(/Z$/, "").slice(0, 19);
  const detail = raw as StravaDetailedActivity;
  return {
    id: String(raw.id),
    athlete,
    sport: toSport(raw.sport_type ?? raw.type ?? ""),
    stravaSportType: raw.sport_type ?? raw.type ?? "Workout",
    name: raw.name?.trim() || raw.sport_type || "Activity",
    description: detail.description?.trim() ? detail.description : null,
    startLocal: `${local}${offsetString(raw.utc_offset ?? 0)}`,
    date: local.slice(0, 10),
    movingTimeSec: raw.moving_time ?? 0,
    elapsedTimeSec: raw.elapsed_time ?? 0,
    distanceM: raw.distance ?? 0,
    elevationGainM: raw.total_elevation_gain ?? 0,
    avgHr: raw.average_heartrate ?? null,
    maxHr: raw.max_heartrate ?? null,
    avgWatts: raw.average_watts ?? null,
    effort: raw.suffer_score ?? null,
    photos,
    detailed,
  };
}

// Writes (scope activity:write)

/**
 * Fields for `POST /activities` (a manual activity). Strava stores no heart
 * rate, power or elevation for manual entries, so none are offered.
 */
export interface CreateActivityInput {
  name: string;
  /** Strava SportType, e.g. "Run", "Ride", "Swim", "WeightTraining". */
  sport_type: string;
  /** Local wall-clock start, ISO 8601 without offset ("2026-11-09T06:30:00"). */
  start_date_local: string;
  /** Seconds. */
  elapsed_time: number;
  description?: string | null;
  /** Meters. */
  distance?: number | null;
  trainer?: boolean;
  commute?: boolean;
}

/** The `UpdatableActivity` fields of `PUT /activities/{id}`. */
export interface UpdateActivityInput {
  name?: string;
  sport_type?: string;
  /** An empty string clears it. */
  description?: string;
  trainer?: boolean;
  commute?: boolean;
  hide_from_home?: boolean;
  /** "none" removes the gear. */
  gear_id?: string;
}

async function stravaWrite<T>(path: string, init: RequestInit & { token: string }): Promise<T> {
  try {
    return await stravaFetch<T>(path, init);
  } catch (err) {
    if (err instanceof StravaError && (err.status === 401 || err.status === 403)) {
      throw new StravaWriteAccessError(err.status, err.body);
    }
    throw err;
  }
}

/** Form body for `createActivity`; Strava documents this endpoint as form data. */
export function createActivityForm(input: CreateActivityInput): URLSearchParams {
  const form = new URLSearchParams({
    name: input.name,
    sport_type: input.sport_type,
    start_date_local: input.start_date_local,
    elapsed_time: String(Math.round(input.elapsed_time)),
  });
  if (input.description) form.set("description", input.description);
  if (input.distance != null) form.set("distance", String(input.distance));
  if (input.trainer !== undefined) form.set("trainer", input.trainer ? "1" : "0");
  if (input.commute !== undefined) form.set("commute", input.commute ? "1" : "0");
  return form;
}

/** Create a manual activity on Strava. Returns the new activity (with its `id`). */
export async function createActivity(
  token: string,
  input: CreateActivityInput,
): Promise<StravaDetailedActivity> {
  return stravaWrite<StravaDetailedActivity>(`/activities`, {
    method: "POST",
    token,
    body: createActivityForm(input),
  });
}

/**
 * Update an activity's editable fields on Strava (JSON body of
 * `UpdatableActivity`). Returns the updated activity.
 */
export async function updateActivity(
  token: string,
  id: number | string,
  input: UpdateActivityInput,
): Promise<StravaDetailedActivity> {
  return stravaWrite<StravaDetailedActivity>(`/activities/${id}`, {
    method: "PUT",
    token,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

// Webhook subscriptions (used by scripts/strava-subscribe.ts)

export interface StravaSubscription {
  id: number;
  callback_url: string;
  created_at: string;
  updated_at: string;
}

export async function listSubscriptions(): Promise<StravaSubscription[]> {
  const params = new URLSearchParams(clientCredentials());
  return stravaFetch<StravaSubscription[]>(`/push_subscriptions?${params}`);
}

export async function createSubscription(
  callbackUrl: string,
  verifyToken: string,
): Promise<StravaSubscription> {
  const body = new URLSearchParams({
    ...clientCredentials(),
    callback_url: callbackUrl,
    verify_token: verifyToken,
  });
  return stravaFetch<StravaSubscription>(`/push_subscriptions`, { method: "POST", body });
}

export async function deleteSubscription(id: number): Promise<void> {
  const params = new URLSearchParams(clientCredentials());
  const res = await fetch(`${STRAVA_API}/push_subscriptions/${id}?${params}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    throw new StravaError(`Strava DELETE push_subscriptions/${id} failed: ${res.status}`, res.status, await res.text());
  }
}
