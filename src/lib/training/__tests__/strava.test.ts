import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  createActivity,
  createActivityForm,
  getRateLimit,
  missingScopes,
  STRAVA_SCOPE,
  StravaError,
  StravaWriteAccessError,
  updateActivity,
} from "../strava";

/**
 * The Strava write calls with fetch mocked: no network, no Supabase. Run
 * with `--conditions=react-server` (see the test script) so strava.ts can
 * import the server-only db module.
 */

interface Captured {
  url: string;
  method: string;
  headers: Headers;
  body: RequestInit["body"];
}

const realFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), method: init.method ?? "GET", headers: new Headers(init.headers), body: init.body });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
  }) as typeof fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("the app asks for read and write and missingScopes checks every one", () => {
  assert.equal(STRAVA_SCOPE, "activity:read_all,activity:write");
  assert.deepEqual(missingScopes("read,activity:read_all,activity:write"), []);
  assert.deepEqual(missingScopes("read,activity:read_all"), ["activity:write"]);
  // The old substring check would have passed this one.
  assert.deepEqual(missingScopes("activity:read_all,activity:write_x"), ["activity:write"]);
  assert.deepEqual(missingScopes(""), ["activity:read_all", "activity:write"]);
  assert.deepEqual(missingScopes(null), ["activity:read_all", "activity:write"]);
});

test("createActivityForm sends Strava's documented fields, booleans as 0/1", () => {
  const form = createActivityForm({
    name: "Leg day",
    sport_type: "WeightTraining",
    start_date_local: "2026-11-08T18:00:00",
    elapsed_time: 2700.4,
    description: "Squats",
    distance: 0,
    trainer: true,
    commute: false,
  });
  assert.deepEqual(Object.fromEntries(form), {
    name: "Leg day",
    sport_type: "WeightTraining",
    start_date_local: "2026-11-08T18:00:00",
    elapsed_time: "2700",
    description: "Squats",
    distance: "0",
    trainer: "1",
    commute: "0",
  });
  const bare = createActivityForm({ name: "Run", sport_type: "Run", start_date_local: "2026-11-08T12:00:00", elapsed_time: 600 });
  assert.deepEqual([...bare.keys()], ["name", "sport_type", "start_date_local", "elapsed_time"]);
});

test("createActivity POSTs the form with the bearer token and records the rate limit", async () => {
  const calls = mockFetch(201, { id: 123, name: "Leg day" }, { "x-ratelimit-limit": "200,2000", "x-ratelimit-usage": "7,50" });
  const created = await createActivity("tok", { name: "Leg day", sport_type: "WeightTraining", start_date_local: "2026-11-08T18:00:00", elapsed_time: 2700 });
  assert.equal(created.id, 123);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://www.strava.com/api/v3/activities");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.get("authorization"), "Bearer tok");
  assert.ok(calls[0].body instanceof URLSearchParams);
  assert.equal((calls[0].body as URLSearchParams).get("elapsed_time"), "2700");
  assert.deepEqual(getRateLimit(), { limit: [200, 2000], usage: [7, 50] });
});

test("updateActivity PUTs UpdatableActivity as JSON", async () => {
  const calls = mockFetch(200, { id: 456, name: "New name" });
  await updateActivity("tok", 456, { name: "New name", description: "", trainer: true });
  assert.equal(calls[0].url, "https://www.strava.com/api/v3/activities/456");
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].headers.get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(calls[0].body)), { name: "New name", description: "", trainer: true });
});

test("a 401 or 403 on a write becomes StravaWriteAccessError with the re-auth hint", async () => {
  const missing = { message: "Authorization Error", errors: [{ resource: "AccessToken", field: "activity:write_permission", code: "missing" }] };
  mockFetch(401, missing);
  await assert.rejects(
    createActivity("tok", { name: "x", sport_type: "Run", start_date_local: "2026-11-08T12:00:00", elapsed_time: 60 }),
    (err: unknown) => {
      assert.ok(err instanceof StravaWriteAccessError);
      assert.ok(err instanceof StravaError);
      assert.equal(err.status, 401);
      assert.match(err.message, /activity:write/);
      assert.match(err.message, /npm run strava:auth` to grant write access/);
      return true;
    },
  );
  mockFetch(403, "Forbidden");
  await assert.rejects(updateActivity("tok", 1, { name: "x" }), StravaWriteAccessError);
});

test("other write failures stay plain StravaErrors", async () => {
  mockFetch(400, { message: "Bad Request", errors: [{ field: "sport_type", code: "invalid" }] });
  await assert.rejects(updateActivity("tok", 1, { sport_type: "Nope" }), (err: unknown) => {
    assert.ok(err instanceof StravaError);
    assert.ok(!(err instanceof StravaWriteAccessError));
    assert.equal(err.status, 400);
    assert.match(err.body, /sport_type/);
    return true;
  });
});
