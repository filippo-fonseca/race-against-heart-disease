import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveId } from "../../admin/plan-import";
import { weekOf } from "../../training/plan";
import { keepUploadedPhotos } from "../../training/photos";
import type { Activity, PlanSession } from "../../training/types";
import { activityPatch, buildManualActivity, compactActivity, isManualId, manualActivityId, sourceOf } from "../activity-logic";
import { checkMcpAuth, extractBearer } from "../auth";
import { checkImageUrl, decodeBase64Image, imageDimensions, pathFromPublicUrl, sniffImageType, validateImage } from "../photo-logic";
import { deletePlanScope, normalizeBatch, normalizePlanInput, planUpsertDiff, replaceRangeDiff, uniqueId, type PlanSessionInput } from "../plan-logic";
import { isRealDate, localStart, McpToolError, validateRange } from "../validate";

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

/* ------------------------------------------------------------------ */
/* Plan: normalisation reuses the admin import's derivation             */
/* ------------------------------------------------------------------ */

const input = (over: Partial<PlanSessionInput>): PlanSessionInput => ({ date: "2026-11-10", sport: "run", title: "Easy run", ...over });

test("normalizePlanInput derives id, week and phase exactly like the CSV import", () => {
  const { session, explicitId } = normalizePlanInput(input({ detail: " Z2 ", target_min: 40 }), 0);
  assert.equal(explicitId, false);
  assert.equal(session.id, deriveId("2026-11-10", "run", "Easy run"));
  assert.equal(session.id, "2026-11-10-run-easy-run");
  assert.equal(session.week, weekOf("2026-11-10").week);
  assert.equal(session.week, 2);
  assert.equal(session.phase, "Base 1");
  assert.equal(session.detail, "Z2");
  assert.deepEqual(session.athletes, []);
  assert.deepEqual(normalizePlanInput(input({ athlete: "emir" }), 0).session.athletes, ["emir"]);
  assert.equal(normalizePlanInput(input({ id: "custom" }), 0).explicitId, true);
});

test("normalizePlanInput rejects a wrong week, dates outside the program and bad numbers", () => {
  assert.throws(() => normalizePlanInput(input({ week: 3 }), 0), /falls in week 2/);
  assert.throws(() => normalizePlanInput(input({ date: "2026-10-30" }), 0), /outside the program/);
  assert.throws(() => normalizePlanInput(input({ date: "2027-04-05" }), 0), /outside the program/);
  assert.throws(() => normalizePlanInput(input({ target_min: 12.5 }), 0), /whole number/);
  assert.throws(() => normalizePlanInput(input({ athlete: "emir" }), 0, { forceAthlete: "filippo" }), /scoped to filippo/);
});

test("normalizeBatch keeps derived ids unique and refuses duplicate explicit ids", () => {
  // Same title for different athletes (a 90 min long run for one, 60 for the other) is normal.
  const ids = normalizeBatch([input({}), input({ athlete: "filippo" }), input({ athlete: "emir" })]).map((n) => n.session.id);
  assert.deepEqual(ids, ["2026-11-10-run-easy-run", "2026-11-10-run-easy-run-filippo", "2026-11-10-run-easy-run-emir"]);
  assert.throws(() => normalizeBatch([input({}), input({ title: "Easy  Run!" })]), /same session twice/);
  assert.throws(() => normalizeBatch([input({ id: "x" }), input({ id: "x", title: "Other" })]), /same id/);
});

test("uniqueId suffixes with the athlete, then counts", () => {
  const taken = new Set(["a", "a-filippo"]);
  assert.equal(uniqueId("b", taken), "b");
  assert.equal(uniqueId("a", taken, "filippo"), "a-filippo-2");
  assert.equal(uniqueId("a", new Set(["a"]), "emir"), "a-emir");
});

/* ------------------------------------------------------------------ */
/* Plan: upsert and replace-range diffing                               */
/* ------------------------------------------------------------------ */

function row(over: Partial<PlanSession>): PlanSession {
  const date = over.date ?? "2026-11-10";
  const title = over.title ?? "Easy run";
  const sport = over.sport ?? "run";
  return {
    id: deriveId(date, sport, title),
    date,
    sport,
    title,
    detail: null,
    targetMin: 40,
    targetKm: null,
    athletes: [],
    phase: "Base 1",
    week: weekOf(date).week,
    ...over,
  };
}

test("planUpsertDiff updates by natural key, creates otherwise, and never reuses another athlete's id", () => {
  const shared = row({});
  const incoming = normalizeBatch([
    input({ target_min: 50 }), // same date, sport, title, athletes: update
    input({ athlete: "filippo" }), // same title for filippo only: create with a suffixed id
    input({ sport: "swim", title: "Technique" }), // new
  ]);
  const diff = planUpsertDiff(incoming, [shared]);
  assert.equal(diff.updates.length, 1);
  assert.equal(diff.updates[0].after.id, shared.id);
  assert.deepEqual(diff.updates[0].fields, ["targetMin"]);
  assert.deepEqual(
    diff.creates.map((s) => s.id),
    ["2026-11-10-run-easy-run-filippo", "2026-11-10-swim-technique"],
  );
});

test("planUpsertDiff moves a row when an explicit id comes with a new date", () => {
  const swim = row({ date: "2026-11-12", sport: "swim", title: "Main set" });
  const diff = planUpsertDiff(normalizeBatch([input({ id: swim.id, date: "2026-11-13", sport: "swim", title: "Main set", target_min: 40 })]), [swim]);
  assert.equal(diff.creates.length, 0);
  assert.deepEqual(diff.updates[0].fields, ["date"]);
  assert.equal(diff.updates[0].after.week, 2);
  const same = planUpsertDiff(normalizeBatch([input({ id: swim.id, date: "2026-11-12", sport: "swim", title: "Main set", target_min: 40 })]), [swim]);
  assert.equal(same.unchanged.length, 1);
});

test("replaceRangeDiff for both athletes keeps matches, updates in place and deletes the rest of the range", () => {
  const existing = [
    row({ date: "2026-11-10", sport: "run", title: "Easy run" }),
    row({ date: "2026-11-10", sport: "swim", title: "Technique" }),
    row({ date: "2026-11-11", sport: "strength", title: "Knee rehab A" }),
    row({ date: "2026-11-20", sport: "run", title: "Outside the range" }),
  ];
  const incoming = normalizeBatch([
    input({ date: "2026-11-10", sport: "run", title: "Easy run", target_min: 40 }), // unchanged
    input({ date: "2026-11-10", sport: "swim", title: "Drills", target_min: 30 }), // lone swim that day: updated in place
    input({ date: "2026-11-11", sport: "bike", title: "Spin" }), // new
  ]);
  const plan = replaceRangeDiff(incoming, existing, { from: "2026-11-10", to: "2026-11-12", athlete: "both" });
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].after.id, "2026-11-10-swim-technique");
  assert.deepEqual(plan.updates[0].fields.sort(), ["targetMin", "title"].sort());
  assert.deepEqual(plan.creates.map((s) => s.id), ["2026-11-11-bike-spin"]);
  assert.deepEqual(plan.deletes.map((s) => s.id), ["2026-11-11-strength-knee-rehab-a"]);
  assert.equal(plan.narrows.length, 0);
});

test("replaceRangeDiff with no sessions clears the range", () => {
  const existing = [row({}), row({ date: "2026-11-12", sport: "swim", title: "Main set" })];
  const plan = replaceRangeDiff([], existing, { from: "2026-11-10", to: "2026-11-10", athlete: "both" });
  assert.deepEqual(plan.deletes.map((s) => s.id), [existing[0].id]);
});

test("replaceRangeDiff for one athlete narrows shared sessions instead of deleting them", () => {
  const sharedRun = row({ date: "2026-11-10", sport: "run", title: "Easy run" });
  const sharedSwim = row({ date: "2026-11-10", sport: "swim", title: "Technique" });
  const emirOnly = row({ date: "2026-11-10", sport: "bike", title: "Spin", id: "emir-spin", athletes: ["emir"] });
  const filippoOnly = row({ date: "2026-11-11", sport: "strength", title: "Knee rehab A", athletes: ["filippo"] });
  const incoming = normalizeBatch(
    [
      input({ date: "2026-11-10", sport: "run", title: "Easy run", target_min: 30 }), // changed for filippo only
      input({ date: "2026-11-11", sport: "swim", title: "Recovery swim" }), // new
    ],
    { forceAthlete: "filippo" },
  );
  const plan = replaceRangeDiff(incoming, [sharedRun, sharedSwim, emirOnly, filippoOnly], { from: "2026-11-10", to: "2026-11-11", athlete: "filippo" });

  // The shared run stays for emir, filippo gets his own shortened copy.
  // The shared swim filippo dropped stays for emir. Emir's ride is untouched.
  assert.deepEqual(
    plan.narrows.map((n) => [n.before.id, n.after.athletes]).sort(),
    [
      [sharedRun.id, ["emir"]],
      [sharedSwim.id, ["emir"]],
    ].sort(),
  );
  assert.deepEqual(plan.creates.map((s) => [s.id, s.athletes, s.targetMin]).sort(), [
    ["2026-11-10-run-easy-run-filippo", ["filippo"], 30],
    ["2026-11-11-swim-recovery-swim", ["filippo"], null],
  ]);
  assert.deepEqual(plan.deletes.map((s) => s.id), [filippoOnly.id]);
  assert.equal(plan.updates.length, 0);
});

test("replaceRangeDiff refuses sessions outside the range", () => {
  assert.throws(
    () => replaceRangeDiff(normalizeBatch([input({ date: "2026-11-12" })]), [], { from: "2026-11-10", to: "2026-11-11", athlete: "both" }),
    /outside the range/,
  );
});

test("deletePlanScope deletes for both, and for one athlete narrows shared rows and skips the other's", () => {
  const shared = row({});
  const emirOnly = row({ id: "e", athletes: ["emir"] });
  const filippoOnly = row({ id: "f", athletes: ["filippo"] });
  assert.equal(deletePlanScope([shared, emirOnly, filippoOnly], "both").deletes.length, 3);
  const scoped = deletePlanScope([shared, emirOnly, filippoOnly], "filippo");
  assert.deepEqual(scoped.deletes.map((s) => s.id), ["f"]);
  assert.deepEqual(scoped.narrows.map((n) => n.after.athletes), [["emir"]]);
  assert.deepEqual(scoped.skipped.map((s) => s.id), ["e"]);
});

/* ------------------------------------------------------------------ */
/* Manual activities                                                    */
/* ------------------------------------------------------------------ */

test("manualActivityId is a negative safe integer that cannot meet a Strava id", () => {
  const now = Date.UTC(2026, 10, 9, 12);
  const id = manualActivityId(now, 0.4567);
  assert.equal(id, -(now * 1000 + 456));
  assert.ok(Number.isSafeInteger(id));
  assert.ok(id < 0);
  assert.equal(manualActivityId(now, 0.99999), -(now * 1000 + 999));
  assert.notEqual(manualActivityId(now, 0.1), manualActivityId(now, 0.2));
  assert.ok(Number.isSafeInteger(manualActivityId(Date.UTC(2200, 0, 1), 0.999)));
  assert.equal(isManualId(id), true);
  assert.equal(isManualId("16812345678"), false);
  assert.equal(sourceOf(String(id)), "manual");
});

test("buildManualActivity requires a duration, refuses future dates and keeps unknowns empty", () => {
  const opts = { id: -1, athlete: "filippo" as const, today: "2026-11-09", index: 0 };
  const a = buildManualActivity({ athlete: "filippo", sport: "strength", date: "2026-11-09", moving_time_min: 45 }, opts);
  assert.equal(a.name, "Strength");
  assert.equal(a.stravaSportType, "WeightTraining");
  assert.equal(a.movingTimeSec, 2700);
  assert.equal(a.elapsedTimeSec, 2700);
  assert.equal(a.startLocal, "2026-11-09T12:00:00-05:00");
  assert.equal(a.avgHr, null);
  assert.equal(a.distanceM, 0);
  const swim = buildManualActivity({ athlete: "filippo", sport: "swim", date: "2026-11-08", start_time: "06:15", moving_time_min: 40, distance_km: 1.8 }, opts);
  assert.equal(swim.distanceM, 1800);
  assert.equal(swim.date, "2026-11-08");
  assert.throws(() => buildManualActivity({ athlete: "filippo", sport: "run", date: "2026-11-10", moving_time_min: 30 }, opts), /future/);
  assert.throws(() => buildManualActivity({ athlete: "filippo", sport: "run", date: "2026-11-09" }, opts), /moving_time_min is required/);
});

test("activityPatch maps fields to columns and keeps the clock when only the date moves", () => {
  const current: Activity = {
    ...buildManualActivity({ athlete: "emir", sport: "run", date: "2026-11-08", start_time: "07:30", moving_time_min: 30 }, { id: -5, athlete: "emir", today: "2026-11-09", index: 0 }),
    // As read back from Postgres: the same instant in UTC.
    startLocal: "2026-11-08T12:30:00+00:00",
  };
  const patch = activityPatch(current, { date: "2026-11-07", distance_km: 6.2, sport: "bike", description: null }, "2026-11-09");
  assert.deepEqual(patch, {
    description: null,
    sport: "bike",
    strava_sport_type: "Ride",
    date: "2026-11-07",
    start_local: "2026-11-07T07:30:00-05:00",
    distance_m: 6200,
  });
  assert.throws(() => activityPatch(current, {}, "2026-11-09"), /nothing to update/);
  assert.throws(() => activityPatch(current, { date: "2026-12-01" }, "2026-11-09"), /future/);
  assert.equal(compactActivity(current).source, "manual");
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
  assert.equal(pathFromPublicUrl("https://x.supabase.co/storage/v1/object/public/training-photos/filippo/-1/upload-a.jpg"), "filippo/-1/upload-a.jpg");
  assert.equal(pathFromPublicUrl("https://dgalywyr863hv.cloudfront.net/pictures/1.jpg"), null);
  const strava = { id: "s1", url: "https://cdn/1.jpg", width: null, height: null, caption: null };
  const upload = { id: "upload-1", url: "https://x/1.jpg", width: 10, height: 10, caption: null };
  assert.deepEqual(keepUploadedPhotos([strava], [strava, upload]), [strava, upload]);
  assert.deepEqual(keepUploadedPhotos([strava], [{ ...strava, id: "old-strava" }]), [strava]);
  assert.deepEqual(keepUploadedPhotos([], null), []);
});
