import { test } from "node:test";
import assert from "node:assert/strict";
import { keepUploadedPhotos } from "../../training/photos";
import type { Activity } from "../../training/types";
import { bucketOf, buildStravaCreate, buildStravaUpdate, compactActivity, createSequentially, sportTotals, type PlannedCreate } from "../activity-logic";
import { checkMcpAuth, extractBearer, requestCredential } from "../auth";
import { applyPhotoEdit, compactPhoto, pickPhotoTarget, withoutPhoto } from "../photo-edit";
import { checkImageUrl, decodeBase64Image, imageDimensions, pathFromPublicUrl, sniffImageType, validateImage } from "../photo-logic";
import { isRealDate, localStart, McpToolError, trainingWindow, validateRange } from "../validate";

/* ------------------------------------------------------------------ */
/* Auth                                                                 */
/* ------------------------------------------------------------------ */

test("extractBearer accepts Bearer (any case) and a bare token", () => {
  assert.equal(extractBearer("Bearer abc"), "abc");
  assert.equal(extractBearer("bearer   abc  "), "abc");
  assert.equal(extractBearer("abc"), "abc");
  assert.equal(extractBearer(""), null);
  assert.equal(extractBearer(null), null);
  assert.equal(extractBearer("Bearer "), "Bearer");
});

test("requestCredential prefers the header and falls back to a key query parameter", () => {
  const base = "https://example.test/api/mcp";
  assert.equal(requestCredential("Bearer from-header", `${base}?key=from-url`), "from-header");
  assert.equal(requestCredential(null, `${base}?key=from-url`), "from-url");
  assert.equal(requestCredential("", `${base}?key=%20spaced%20`), "spaced");
  assert.equal(requestCredential(null, `${base}?key=`), null);
  assert.equal(requestCredential(null, base), null);
  assert.deepEqual(checkMcpAuth(requestCredential(null, `${base}?key=test-token`), "test-token"), { ok: true });
  assert.equal(checkMcpAuth(requestCredential(null, `${base}?key=nope`), "test-token").ok, false);
});

test("checkMcpAuth is closed without MCP_TOKEN and constant-time checks the token", () => {
  assert.deepEqual(checkMcpAuth("Bearer x", undefined), { ok: false, status: 503, message: "MCP endpoint is not configured (MCP_TOKEN is unset)." });
  assert.equal(checkMcpAuth("Bearer x", "  ").ok, false);
  const wrong = checkMcpAuth("Bearer nope", "test-token");
  assert.equal(wrong.ok, false);
  assert.equal(!wrong.ok && wrong.status, 401);
  assert.equal(checkMcpAuth(null, "test-token").ok, false);
  assert.deepEqual(checkMcpAuth("Bearer test-token", "test-token"), { ok: true });
  assert.deepEqual(checkMcpAuth("test-token", "test-token"), { ok: true });
});

/* ------------------------------------------------------------------ */
/* Dates                                                                */
/* ------------------------------------------------------------------ */

test("isRealDate rejects impossible calendar days", () => {
  assert.equal(isRealDate("2026-11-09"), true);
  assert.equal(isRealDate("2027-02-29"), false);
  assert.equal(isRealDate("2026-13-01"), false);
  assert.equal(isRealDate("2026-11-9"), false);
});

test("validateRange checks order, realness and length", () => {
  assert.deepEqual(validateRange("2026-11-09", "2026-11-15", 7), { from: "2026-11-09", to: "2026-11-15", days: 7 });
  assert.throws(() => validateRange("2026-11-15", "2026-11-09", 7), McpToolError);
  assert.throws(() => validateRange("2026-11-09", "2026-11-16", 7), /limit for this tool is 7/);
  assert.throws(() => validateRange("2026-02-30", "2026-03-01", 7), /real date/);
});

test("localStart attaches the New York offset for the day (EST and EDT)", () => {
  assert.equal(localStart("2026-11-09", "06:30"), "2026-11-09T06:30:00-05:00");
  assert.equal(localStart("2027-04-04", "07:00"), "2027-04-04T07:00:00-04:00");
  assert.throws(() => localStart("2026-11-09", "25:00"), /HH:MM/);
});

test("trainingWindow numbers the days from Nov 2 to race day", () => {
  const day1 = trainingWindow("2026-11-02");
  assert.equal(day1.day_number, 1);
  assert.equal(day1.total_days, 154);
  assert.equal(day1.days_to_race, 153);
  assert.equal(trainingWindow("2026-11-09").day_number, 8);
  const race = trainingWindow("2027-04-04");
  assert.equal(race.day_number, 154);
  assert.equal(race.days_to_race, 0);
  assert.match(race.status, /Race day/);
  assert.equal(trainingWindow("2026-11-01").day_number, null);
  assert.match(trainingWindow("2026-11-01").status, /Before training/);
  assert.equal(trainingWindow("2027-04-05").day_number, null);
  assert.equal(trainingWindow("2027-04-05").days_to_race, -1);
});

test("sportTotals buckets everything that is not swim, bike or run as strength (LIFT)", () => {
  const totals = sportTotals([
    { sport: "bike", moving_time_sec: 3600, distance_m: 30000 },
    { sport: "bike", moving_time_sec: 1800, distance_m: "0" },
    { sport: "run", moving_time_sec: 2700, distance_m: 8000 },
    { sport: "strength", moving_time_sec: 1800, distance_m: null },
    { sport: "other", moving_time_sec: 1800, distance_m: 0 },
  ]);
  assert.deepEqual(totals.bike, { label: "BIKE", sessions: 2, hours: 1.5, km: 30 });
  assert.deepEqual(totals.run, { label: "RUN", sessions: 1, hours: 0.8, km: 8 });
  assert.deepEqual(totals.strength, { label: "LIFT", sessions: 2, hours: 1, km: 0 });
  assert.deepEqual(totals.swim, { label: "SWIM", sessions: 0, hours: 0, km: 0 });
  assert.equal(bucketOf("VirtualRide"), "strength", "buckets come from the stored sport, not the Strava type");
  assert.equal(bucketOf("bike"), "bike");
});

/* ------------------------------------------------------------------ */
/* Activities: payloads for Strava                                      */
/* ------------------------------------------------------------------ */

test("buildStravaCreate maps a session to Strava's create fields with sane defaults", () => {
  const opts = { today: "2026-11-09", index: 0 };
  assert.deepEqual(buildStravaCreate({ sport: "strength", date: "2026-11-09", duration_min: 45 }, opts), {
    name: "Lift",
    sport_type: "HighIntensityIntervalTraining",
    start_date_local: "2026-11-09T12:00:00",
    elapsed_time: 2700,
  });
  // An explicit Strava type wins over the bucket default.
  assert.equal(buildStravaCreate({ sport: "strength", sport_type: "WeightTraining", date: "2026-11-09", duration_min: 45 }, opts).sport_type, "WeightTraining");
  // Indoor ride: a Ride with trainer set, time without distance.
  assert.deepEqual(buildStravaCreate({ sport: "bike", trainer: true, date: "2026-11-09", duration_min: 75 }, opts), {
    name: "Indoor ride",
    sport_type: "Ride",
    start_date_local: "2026-11-09T12:00:00",
    elapsed_time: 4500,
    trainer: true,
  });
  const swim = buildStravaCreate(
    { sport: "swim", date: "2026-11-08", start_time: "06:15", duration_min: 40.5, distance_km: 1.8, name: " Masters ", description: " 10 x 100 ", trainer: false },
    opts,
  );
  assert.deepEqual(swim, {
    name: "Masters",
    sport_type: "Swim",
    start_date_local: "2026-11-08T06:15:00",
    elapsed_time: 2430,
    description: "10 x 100",
    distance: 1800,
    trainer: false,
  });
  assert.equal(buildStravaCreate({ sport: "bike", sport_type: "VirtualRide", date: "2026-11-09", duration_min: 60 }, opts).sport_type, "VirtualRide");
});

test("buildStravaCreate refuses future dates, missing durations and bad sport types", () => {
  const opts = { today: "2026-11-09", index: 2 };
  assert.throws(() => buildStravaCreate({ sport: "run", date: "2026-11-10", duration_min: 30 }, opts), /activities\[2\]\.date .*future/);
  assert.throws(() => buildStravaCreate({ sport: "run", date: "2026-11-09" } as never, opts), /duration_min is required/);
  assert.throws(() => buildStravaCreate({ sport: "run", date: "2026-11-09", duration_min: 0 }, opts), /duration_min is required/);
  assert.throws(() => buildStravaCreate({ sport: "run", date: "2026-11-09", duration_min: 30, sport_type: "trail run" }, opts), /not a Strava sport type/);
  assert.throws(() => buildStravaCreate({ sport: "run", date: "2026-11-09", duration_min: 30, start_time: "7:00" }, opts), /HH:MM/);
  assert.throws(() => buildStravaCreate({ sport: "other", date: "2026-11-09", duration_min: 30 } as never, opts), /swim, bike, run or strength/);
});

test("buildStravaUpdate sends only Strava-updatable fields and skips no-op sport changes", () => {
  const ride = { sport: "bike" as const, stravaSportType: "VirtualRide" };
  assert.deepEqual(buildStravaUpdate(ride, { name: " Zwift ", description: null, trainer: true }), { name: "Zwift", description: "", trainer: true });
  // Same sport keeps the more specific sport type.
  assert.throws(() => buildStravaUpdate(ride, { sport: "bike" }), /nothing to update/);
  assert.deepEqual(buildStravaUpdate(ride, { sport: "run" }), { sport_type: "Run" });
  assert.deepEqual(buildStravaUpdate(ride, { sport: "run", sport_type: "TrailRun" }), { sport_type: "TrailRun" });
  assert.throws(() => buildStravaUpdate(ride, { sport_type: "VirtualRide" }), /nothing to update/);
  assert.deepEqual(buildStravaUpdate(ride, { commute: false, hide_from_home: true }), { commute: false, hide_from_home: true });
  assert.throws(() => buildStravaUpdate(ride, {}), /nothing to update/);
  assert.throws(() => buildStravaUpdate(ride, { name: "  " }), /cannot be empty/);
  // Fields Strava cannot update are not part of the contract at all.
  assert.throws(() => buildStravaUpdate(ride, { distance_km: 5 } as never), /nothing to update/);
  // A stored "other" counts as strength, so strength is a no-op and keeps WeightTraining.
  const weights = { sport: "other" as never, stravaSportType: "WeightTraining" };
  assert.throws(() => buildStravaUpdate(weights, { sport: "strength" }), /nothing to update/);
  assert.deepEqual(buildStravaUpdate({ sport: "run" as const, stravaSportType: "Run" }, { sport: "strength" }), { sport_type: "HighIntensityIntervalTraining" });
});

const plannedCreate = (index: number): PlannedCreate => ({
  index,
  athlete: "filippo" as const,
  payload: { name: `S${index}`, sport_type: "Run", start_date_local: "2026-11-08T12:00:00", elapsed_time: 600 },
});

test("createSequentially creates in order and finishes when nothing goes wrong", async () => {
  const seen: number[] = [];
  const res = await createSequentially([plannedCreate(0), plannedCreate(1)], { nearLimit: () => false, create: async (p) => (seen.push(p.index), p.index * 10) });
  assert.deepEqual(seen, [0, 1]);
  assert.deepEqual(res, { done: [0, 10], remaining: [], stopped: null });
});

test("createSequentially stops before the rate limit and on the first failure", async () => {
  let calls = 0;
  const limited = await createSequentially([plannedCreate(0), plannedCreate(1), plannedCreate(2)], {
    nearLimit: () => calls >= 1,
    create: async () => ++calls,
  });
  assert.deepEqual(limited.done, [1]);
  assert.deepEqual(limited.remaining.map((p) => p.index), [1, 2]);
  assert.equal(limited.stopped?.reason, "rate_limit");

  const failed = await createSequentially([plannedCreate(0), plannedCreate(1), plannedCreate(2)], {
    nearLimit: () => false,
    create: async (p) => {
      if (p.index === 1) throw new Error("Strava refused the write");
      return p.index;
    },
  });
  assert.deepEqual(failed.done, [0]);
  assert.deepEqual(failed.remaining.map((p) => p.index), [1, 2]);
  assert.equal(failed.stopped?.reason, "error");
  assert.equal(failed.stopped?.item?.index, 1);
  assert.match(failed.stopped?.message ?? "", /refused/);
});

test("compactActivity links to Strava and carries no manual source", () => {
  const a: Activity = {
    id: "16812345678",
    athlete: "filippo",
    sport: "run",
    stravaSportType: "Run",
    name: "Easy",
    description: null,
    startLocal: "2026-11-08T07:30:00-05:00",
    date: "2026-11-08",
    movingTimeSec: 1800,
    elapsedTimeSec: 1860,
    distanceM: 6234,
    elevationGainM: 12.4,
    avgHr: 140,
    maxHr: null,
    avgWatts: null,
    effort: null,
    photos: [],
    detailed: true,
  };
  const c = compactActivity(a);
  assert.equal(c.strava_url, "https://www.strava.com/activities/16812345678");
  assert.equal(c.moving_time_min, 30);
  assert.equal(c.distance_km, 6.23);
  assert.equal("source" in c, false);
});

/* ------------------------------------------------------------------ */
/* Photos                                                               */
/* ------------------------------------------------------------------ */

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

function jpeg(width: number, height: number, orientation?: number): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  if (orientation) {
    // APP1 Exif, big-endian TIFF, IFD0 with one Orientation entry.
    const tiff = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0, 0, 0];
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    parts.push(0xff, 0xe1, ((body.length + 2) >> 8) & 0xff, (body.length + 2) & 0xff, ...body);
  }
  parts.push(0xff, 0xc0, 0, 17, 8, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 3, ...new Array(9).fill(0));
  parts.push(0xff, 0xd9);
  return Uint8Array.from(parts);
}

test("sniffImageType recognises JPEG, PNG, WebP and HEIC by magic bytes", () => {
  assert.equal(sniffImageType(jpeg(10, 10)), "image/jpeg");
  assert.equal(sniffImageType(png(1, 1)), "image/png");
  const webp = Uint8Array.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X"), 0, 0, 0, 0, 0, 0, 0, 0, 0x7f, 0x07, 0, 0x37, 0x04, 0]);
  assert.equal(sniffImageType(webp), "image/webp");
  assert.deepEqual(imageDimensions(webp, "image/webp"), { width: 1920, height: 1080 });
  const heic = Uint8Array.from([0, 0, 0, 24, ...Buffer.from("ftypheic"), 0, 0, 0, 0]);
  assert.equal(sniffImageType(heic), "image/heic");
  assert.equal(sniffImageType(Buffer.from("GIF89a....")), null);
});

test("imageDimensions reads PNG and JPEG sizes and honours EXIF rotation", () => {
  assert.deepEqual(imageDimensions(png(1200, 800), "image/png"), { width: 1200, height: 800 });
  assert.deepEqual(imageDimensions(jpeg(4032, 3024), "image/jpeg"), { width: 4032, height: 3024 });
  assert.deepEqual(imageDimensions(jpeg(4032, 3024, 6), "image/jpeg"), { width: 3024, height: 4032 });
});

test("validateImage trusts the bytes over the declared type and enforces the limits", () => {
  assert.equal(validateImage(png(2, 2), "image/jpeg").mime, "image/png");
  assert.throws(() => validateImage(Buffer.from("<html>"), "text/html"), /not a JPEG, PNG, WebP or HEIC/);
  assert.throws(() => validateImage(new Uint8Array(0), null), /empty/);
  assert.throws(() => validateImage(new Uint8Array(15 * 1024 * 1024 + 1), null), /limit is 15 MB/);
});

test("decodeBase64Image accepts raw base64 and data URLs and rejects junk", () => {
  const bytes = png(3, 4);
  const b64 = Buffer.from(bytes).toString("base64");
  assert.deepEqual(decodeBase64Image(b64).bytes, bytes);
  const fromUrl = decodeBase64Image(`data:image/png;base64,${b64}`);
  assert.equal(fromUrl.declared, "image/png");
  assert.deepEqual(fromUrl.bytes, bytes);
  assert.throws(() => decodeBase64Image("not base64 !!"), /not valid base64/);
});

test("checkImageUrl allows public http(s) and blocks local or private hosts", () => {
  assert.equal(checkImageUrl("https://api.telegram.org/file/botX/photos/a.jpg").hostname, "api.telegram.org");
  assert.equal(checkImageUrl("https://fcbarcelona.com/a.jpg").hostname, "fcbarcelona.com");
  for (const bad of ["http://localhost/a.jpg", "http://127.0.0.1/a", "http://10.0.0.2/a", "http://192.168.1.4/a", "http://169.254.169.254/latest", "http://[::1]/a", "ftp://example.com/a", "https://u:p@example.com/a"]) {
    assert.throws(() => checkImageUrl(bad), McpToolError, bad);
  }
});

test("pathFromPublicUrl and keepUploadedPhotos", () => {
  assert.equal(pathFromPublicUrl("https://x.supabase.co/storage/v1/object/public/training-photos/filippo/16800000001/upload-a.jpg"), "filippo/16800000001/upload-a.jpg");
  assert.equal(pathFromPublicUrl("https://dgalywyr863hv.cloudfront.net/pictures/1.jpg"), null);
  const strava = { id: "s1", url: "https://cdn/1.jpg", width: null, height: null, caption: null };
  const upload = { id: "upload-1", url: "https://x/1.jpg", width: 10, height: 10, caption: null };
  assert.deepEqual(keepUploadedPhotos([strava], [strava, upload]), [strava, upload]);
  assert.deepEqual(keepUploadedPhotos([strava], [{ ...strava, id: "old-strava" }]), [strava]);
  assert.deepEqual(keepUploadedPhotos([], null), []);
});

/* ------------------------------------------------------------------ */
/* Photos: lookup and editing                                           */
/* ------------------------------------------------------------------ */

const day = (id: string, date: string, sport: string) => ({ id, date, sport });

test("pickPhotoTarget attaches to a single match and hands back zero or several", () => {
  const acts = [day("1", "2026-11-08", "run"), day("2", "2026-11-09", "bike"), day("3", "2026-11-09", "strength"), day("4", "2026-11-09", "other")];
  assert.deepEqual(pickPhotoTarget(acts, { date: "2026-11-08" }, bucketOf), { kind: "one", activity: acts[0] });
  assert.deepEqual(pickPhotoTarget(acts, { date: "2026-11-07" }, bucketOf), { kind: "none" });
  const many = pickPhotoTarget(acts, { date: "2026-11-09" }, bucketOf);
  assert.equal(many.kind, "many");
  assert.deepEqual(many.kind === "many" && many.candidates.map((a) => a.id), ["2", "3", "4"]);
  // A sport narrows it: bike is unique that day; strength covers "other" too, so it is still ambiguous.
  assert.deepEqual(pickPhotoTarget(acts, { date: "2026-11-09", sport: "bike" }, bucketOf), { kind: "one", activity: acts[1] });
  const lifts = pickPhotoTarget(acts, { date: "2026-11-09", sport: "strength" }, bucketOf);
  assert.deepEqual(lifts.kind === "many" && lifts.candidates.map((a) => a.id), ["3", "4"]);
  assert.deepEqual(pickPhotoTarget(acts, { date: "2026-11-09", sport: "swim" }, bucketOf), { kind: "none" });
});

const sPhoto = (id: string) => ({ id, url: `https://cdn.cloudfront.net/${id}.jpg`, width: 1200, height: 900, caption: null });
const uPhoto = (n: number, caption: string | null = null) => ({ id: `upload-${n}`, url: `https://x.supabase.co/storage/v1/object/public/training-photos/filippo/1/upload-${n}.jpg`, width: 800, height: 600, caption });

test("compactPhoto labels Strava photos read-only and added photos editable", () => {
  assert.deepEqual(compactPhoto(sPhoto("s1"), 0), { id: "s1", position: 1, source: "strava", editable: false, url: "https://cdn.cloudfront.net/s1.jpg", caption: null, width: 1200, height: 900 });
  assert.equal(compactPhoto(uPhoto(1), 2).source, "mcp");
  assert.equal(compactPhoto(uPhoto(1), 2).editable, true);
  assert.equal(compactPhoto(uPhoto(1), 2).position, 3);
});

test("applyPhotoEdit changes captions and replaces images in place, never Strava photos", () => {
  const photos = [sPhoto("s1"), uPhoto(1, "old"), uPhoto(2)];
  assert.deepEqual(applyPhotoEdit(photos, { photo_id: "upload-1", caption: "  Mile 6 " })[1], { ...uPhoto(1), caption: "Mile 6" });
  assert.equal(applyPhotoEdit(photos, { photo_id: "upload-1", caption: null })[1].caption, null);
  assert.equal(applyPhotoEdit(photos, { photo_id: "upload-1", caption: "" })[1].caption, null);

  const replacement = { ...uPhoto(9), width: 4000, height: 3000 };
  const replaced = applyPhotoEdit(photos, { photo_id: "upload-1", replacement });
  assert.deepEqual(replaced.map((p) => p.id), ["s1", "upload-9", "upload-2"]);
  assert.equal(replaced[1].caption, "old", "a replaced image keeps its caption");
  assert.equal(applyPhotoEdit(photos, { photo_id: "upload-1", replacement, caption: "new" })[1].caption, "new");

  assert.throws(() => applyPhotoEdit(photos, { photo_id: "s1", caption: "x" }), /comes from Strava and is read-only/);
  assert.throws(() => applyPhotoEdit(photos, { photo_id: "upload-7", caption: "x" }), /no photo upload-7/);
  assert.throws(() => applyPhotoEdit(photos, { caption: "x" }), /photo_id is required/);
  assert.throws(() => applyPhotoEdit(photos, {}), /Nothing to update/);
  assert.throws(() => applyPhotoEdit(photos, { photo_id: "upload-1", caption: "x".repeat(301) }), /longer than 300/);
});

test("applyPhotoEdit reorders the added photos and keeps Strava photos first", () => {
  const photos = [sPhoto("s1"), uPhoto(1), sPhoto("s2"), uPhoto(2), uPhoto(3)];
  assert.deepEqual(applyPhotoEdit(photos, { order: ["upload-3", "upload-1", "upload-2"] }).map((p) => p.id), ["s1", "s2", "upload-3", "upload-1", "upload-2"]);
  // Reorder and caption together; the caption follows the photo.
  const both = applyPhotoEdit(photos, { order: ["upload-2", "upload-3", "upload-1"], photo_id: "upload-1", caption: "last" });
  assert.deepEqual(both.map((p) => [p.id, p.caption]).slice(2), [["upload-2", null], ["upload-3", null], ["upload-1", "last"]]);
  assert.throws(() => applyPhotoEdit(photos, { order: ["upload-1", "upload-2"] }), /missing: upload-3/);
  assert.throws(() => applyPhotoEdit(photos, { order: ["upload-1", "upload-1", "upload-2"] }), /more than once/);
  assert.throws(() => applyPhotoEdit(photos, { order: ["s1", "upload-1", "upload-2", "upload-3"] }), /read-only/);
  assert.throws(() => applyPhotoEdit(photos, { order: ["upload-1", "upload-2", "upload-x"] }), /not a photo added/);
});

test("withoutPhoto removes an added photo and refuses Strava photos", () => {
  const photos = [sPhoto("s1"), uPhoto(1), uPhoto(2)];
  const { photos: rest, removed } = withoutPhoto(photos, "upload-1");
  assert.deepEqual(rest.map((p) => p.id), ["s1", "upload-2"]);
  assert.equal(removed.id, "upload-1");
  assert.throws(() => withoutPhoto(photos, "s1"), /read-only/);
  assert.throws(() => withoutPhoto(photos, "upload-5"), /no photo upload-5/);
});
