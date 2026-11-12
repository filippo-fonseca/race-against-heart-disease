import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { AthleteRow } from "../db";
import { updateActivity } from "../strava";
import { nextStamp, syncActivity, updateActivityPhotos } from "../sync";
import type { ActivityPhoto } from "../types";
import { fakeBackend, stravaDetail, stravaPhoto, pointDbAtFakeSupabase, type FakeBackend, type Row } from "./fake-backend";

/**
 * Photos added through the MCP server live in the mirror row next to the
 * Strava photos. These tests run the real sync code against a fake
 * PostgREST and a fake Strava to prove a resync (webhook, cron, or the one
 * after update_activity) never wipes them, even when it races an upload.
 */

pointDbAtFakeSupabase();

const ID = 16800000001;

const athlete = {
  slug: "filippo",
  name: "Filippo",
  strava_id: 1,
  avatar_url: null,
  access_token: "tok",
  refresh_token: "refresh",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  created_at: "2026-11-01T00:00:00Z",
} as AthleteRow;

const upload = (n: number): ActivityPhoto => ({
  id: `upload-${n}`,
  url: `https://fake-project.supabase.test/storage/v1/object/public/training-photos/filippo/${ID}/upload-${n}.jpg`,
  width: 800,
  height: 600,
  caption: `uploaded ${n}`,
});

const stravaPhotoId = (p: ActivityPhoto) => p.id;

let backend: FakeBackend;

function seedRow(photos: ActivityPhoto[]): Row {
  const row: Row = { id: ID, athlete_slug: "filippo", name: "Old name", photos, detailed: true, updated_at: "2026-11-08T13:00:00.000Z" };
  backend.rows.set(ID, row);
  return row;
}

function storedPhotos(): ActivityPhoto[] {
  return backend.rows.get(ID)!.photos as ActivityPhoto[];
}

beforeEach(() => {
  backend = fakeBackend();
});

afterEach(() => {
  backend.restore();
});

test("nextStamp always moves forward", () => {
  assert.equal(nextStamp(null, Date.UTC(2026, 10, 9)), "2026-11-09T00:00:00.000Z");
  assert.equal(nextStamp("2026-11-09T00:00:05.000Z", Date.UTC(2026, 10, 9)), "2026-11-09T00:00:05.001Z");
  assert.equal(nextStamp("2026-11-08T00:00:00+00:00", Date.UTC(2026, 10, 9)), "2026-11-09T00:00:00.000Z");
  assert.equal(nextStamp("not a date", Date.UTC(2026, 10, 9)), "2026-11-09T00:00:00.000Z");
});

test("a resync shows Strava's current photos and keeps every uploaded one", async () => {
  // Stored: one Strava photo the athlete has since removed on Strava, plus two uploads.
  seedRow([{ id: "strava-gone", url: "https://x.cloudfront.net/gone.jpg", width: 1, height: 1, caption: null }, upload(1), upload(2)]);
  backend.strava.set(ID, {
    detail: stravaDetail(ID, { name: "Long run", photos: { count: 2, primary: null } }),
    photos: [stravaPhoto("strava-a"), stravaPhoto("strava-b")],
  });

  const activity = await syncActivity(athlete, ID);

  assert.deepEqual(activity.photos.map(stravaPhotoId), ["strava-a", "strava-b"]);
  assert.deepEqual(storedPhotos().map(stravaPhotoId), ["strava-a", "strava-b", "upload-1", "upload-2"]);
  assert.equal(backend.rows.get(ID)!.name, "Long run");
  assert.notEqual(backend.rows.get(ID)!.updated_at, "2026-11-08T13:00:00.000Z");
});

test("a resync keeps the order and captions set with update_photo", async () => {
  seedRow([{ ...upload(2), caption: "finish line" }, upload(1)]);
  backend.strava.set(ID, { detail: stravaDetail(ID, { photos: { count: 1, primary: null } }), photos: [stravaPhoto("strava-a")] });
  await syncActivity(athlete, ID);
  assert.deepEqual(storedPhotos().map((p) => [p.id, p.caption]), [["strava-a", null], ["upload-2", "finish line"], ["upload-1", "uploaded 1"]]);
});

test("an upload that lands between the resync's read and write is not lost", async () => {
  seedRow([upload(1)]);
  backend.strava.set(ID, { detail: stravaDetail(ID, { photos: { count: 1, primary: null } }), photos: [stravaPhoto("strava-a")] });
  // add_photo commits while the webhook's resync is mid-flight.
  backend.beforeNextPatch = () => {
    const row = backend.rows.get(ID)!;
    backend.rows.set(ID, { ...row, photos: [...(row.photos as ActivityPhoto[]), upload(2)], updated_at: "2026-11-08T13:00:01.000Z" });
  };

  await syncActivity(athlete, ID);

  assert.deepEqual(storedPhotos().map(stravaPhotoId), ["strava-a", "upload-1", "upload-2"]);
  assert.equal(backend.calls.filter((c) => c.method === "PATCH").length, 2, "the conflicting write is retried once");
});

test("photos survive update_activity: Strava PUT, then resync", async () => {
  seedRow([upload(1)]);
  backend.strava.set(ID, { detail: stravaDetail(ID), photos: [] });

  await updateActivity("tok", ID, { name: "Tempo run", description: "Felt strong" });
  const activity = await syncActivity(athlete, ID);

  assert.equal(activity.name, "Tempo run");
  assert.equal(backend.rows.get(ID)!.description, "Felt strong");
  assert.deepEqual(storedPhotos().map(stravaPhotoId), ["upload-1"]);
});

test("a brand-new activity is inserted, and an insert race falls back to merging", async () => {
  backend.strava.set(ID, { detail: stravaDetail(ID), photos: [] });
  await syncActivity(athlete, ID);
  assert.equal(backend.rows.get(ID)!.name, "Morning Run");

  // Second activity: someone inserts the row between our read and insert.
  const other = ID + 1;
  backend.strava.set(other, { detail: stravaDetail(other, { name: "Swim" }), photos: [] });
  const realFetch = globalThis.fetch;
  let raced = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!raced && (init?.method ?? "GET") === "POST") {
      raced = true;
      backend.rows.set(other, { id: other, photos: [upload(9)], updated_at: "2026-11-08T13:00:00.000Z" });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  try {
    await syncActivity(athlete, other);
  } finally {
    globalThis.fetch = realFetch;
  }
  const row = backend.rows.get(other)!;
  assert.equal(row.name, "Swim");
  assert.deepEqual((row.photos as ActivityPhoto[]).map(stravaPhotoId), ["upload-9"]);
});

test("updateActivityPhotos retries on a concurrent write and returns null for unknown ids", async () => {
  seedRow([{ id: "strava-a", url: "https://x.cloudfront.net/a.jpg", width: 1, height: 1, caption: null }]);
  backend.beforeNextPatch = () => {
    const row = backend.rows.get(ID)!;
    // A resync rewrote the row (new Strava photo) in the meantime.
    backend.rows.set(ID, { ...row, photos: [...(row.photos as ActivityPhoto[]), { id: "strava-b", url: "https://x.cloudfront.net/b.jpg", width: 1, height: 1, caption: null }], updated_at: "2026-11-08T13:00:02.000Z" });
  };
  const result = await updateActivityPhotos(ID, (photos) => [...photos, upload(3)]);
  assert.deepEqual(result?.map(stravaPhotoId), ["strava-a", "strava-b", "upload-3"]);
  assert.deepEqual(storedPhotos().map(stravaPhotoId), ["strava-a", "strava-b", "upload-3"]);
  assert.equal(await updateActivityPhotos(999, (p) => p), null);
});

test("needsDetail re-fetches an activity whose photo count changed on Strava", async () => {
  const { needsDetail } = await import("../sync");
  assert.equal(needsDetail(0, undefined), true, "never detailed");
  assert.equal(needsDetail(undefined, undefined), true, "never detailed, no count in list");
  assert.equal(needsDetail(0, 0), false, "no photos, unchanged");
  assert.equal(needsDetail(2, 2), false, "photos, unchanged");
  assert.equal(needsDetail(3, 0), true, "photos added after upload");
  assert.equal(needsDetail(1, 2), true, "a photo removed");
  assert.equal(needsDetail(undefined, 2), false, "list without a count keeps the stored row");
});
