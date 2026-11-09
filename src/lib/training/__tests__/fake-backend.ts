/**
 * In-memory stand-ins for the two HTTP services the data layer talks to, so
 * sync tests run with no network: a tiny PostgREST (just the calls sync.ts
 * makes on `training.activities`) and the Strava activity endpoints. Both
 * are served by replacing `globalThis.fetch`; supabase-js resolves fetch at
 * call time, so it goes through the fake too.
 */

export const FAKE_SUPABASE_URL = "https://fake-project.supabase.test";

/** Point db() at the fake. Call before the first db() use. */
export function useFakeSupabaseEnv(): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL = FAKE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
}

export type Row = Record<string, unknown> & { id: number; updated_at: string };

export interface FakeBackend {
  rows: Map<number, Row>;
  /** Strava detail and photo payloads by activity id. */
  strava: Map<number, { detail: Record<string, unknown>; photos: Record<string, unknown>[] }>;
  /** Runs once, right before the next PATCH is applied (simulates a concurrent writer). */
  beforeNextPatch: (() => void) | null;
  calls: { method: string; url: string; body?: unknown }[];
  restore: () => void;
}

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function eqFilter(params: URLSearchParams, column: string): string | null {
  const v = params.get(column);
  return v && v.startsWith("eq.") ? v.slice(3) : null;
}

function pick(row: Row, select: string | null): Record<string, unknown> {
  if (!select || select === "*") return { ...row };
  return Object.fromEntries(select.split(",").map((c) => [c.trim(), row[c.trim()]]));
}

export function fakeBackend(): FakeBackend {
  const real = globalThis.fetch;
  const backend: FakeBackend = {
    rows: new Map(),
    strava: new Map(),
    beforeNextPatch: null,
    calls: [],
    restore: () => {
      globalThis.fetch = real;
    },
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const rawBody = typeof init.body === "string" ? init.body : undefined;
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    backend.calls.push({ method, url: url.toString(), body });

    if (url.origin === FAKE_SUPABASE_URL && url.pathname === "/rest/v1/activities") {
      const id = Number(eqFilter(url.searchParams, "id"));
      const select = url.searchParams.get("select");
      if (method === "GET") {
        const row = backend.rows.get(id);
        return json(200, row ? [pick(row, select)] : []);
      }
      if (method === "POST") {
        const rows = (Array.isArray(body) ? body : [body]) as Row[];
        for (const r of rows) {
          if (backend.rows.has(Number(r.id))) return json(409, { code: "23505", message: "duplicate key value violates unique constraint" });
        }
        for (const r of rows) backend.rows.set(Number(r.id), { ...r, id: Number(r.id) });
        return json(201, undefined);
      }
      if (method === "PATCH") {
        const hook = backend.beforeNextPatch;
        backend.beforeNextPatch = null;
        hook?.();
        const row = backend.rows.get(id);
        const stamp = eqFilter(url.searchParams, "updated_at");
        if (!row || (stamp !== null && row.updated_at !== stamp)) return json(200, []);
        const next = { ...row, ...(body as Record<string, unknown>), id } as Row;
        backend.rows.set(id, next);
        return json(200, [pick(next, select)]);
      }
    }

    if (url.origin === "https://www.strava.com") {
      const m = /^\/api\/v3\/activities\/(\d+)(\/photos)?$/.exec(url.pathname);
      const entry = m ? backend.strava.get(Number(m[1])) : undefined;
      if (m && entry && method === "GET") return json(200, m[2] ? entry.photos : entry.detail);
      if (m && entry && method === "PUT") {
        entry.detail = { ...entry.detail, ...(body as Record<string, unknown>) };
        return json(200, entry.detail);
      }
      return json(404, { message: "Record Not Found" });
    }

    throw new Error(`fake backend: unexpected ${method} ${url}`);
  }) as typeof fetch;

  return backend;
}

/** A Strava detailed activity payload with sensible defaults. */
export function stravaDetail(id: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: "Morning Run",
    sport_type: "Run",
    start_date: "2026-11-08T12:30:00Z",
    start_date_local: "2026-11-08T07:30:00Z",
    utc_offset: -18000,
    moving_time: 1800,
    elapsed_time: 1860,
    distance: 6000,
    total_elevation_gain: 10,
    description: null,
    photos: { count: 0, primary: null },
    ...over,
  };
}

/** A Strava photo payload as the photos endpoint returns it. */
export function stravaPhoto(uniqueId: string): Record<string, unknown> {
  return { unique_id: uniqueId, caption: null, urls: { "1200": `https://dgtzuqphqg23d.cloudfront.net/${uniqueId}.jpg` }, sizes: { "1200": [1200, 900] } };
}
