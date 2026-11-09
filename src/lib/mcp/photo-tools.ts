import { randomUUID } from "node:crypto";
import { UPLOADED_PHOTO_PREFIX } from "../training/photos";
import { listActivities } from "../training/queries";
import { updateActivityPhotos } from "../training/sync";
import type { Activity, ActivityPhoto } from "../training/types";
import { bucketOf, BUCKET_LABEL, type SportBucket } from "./activity-logic";
import { parseActivityId, requireActivity } from "./activity-tools";
import { invalidateTraining } from "./cache";
import { applyPhotoEdit, compactPhoto, pickPhotoTarget, withoutPhoto } from "./photo-edit";
import { checkImageUrl, decodeBase64Image, MAX_PHOTO_BYTES, redactUrl, storagePath, validateImage } from "./photo-logic";
import { removeStoredPhotos, uploadPhoto } from "./photo-storage";
import { assertDate, ATHLETE, McpToolError } from "./validate";

/**
 * add_photo, update_photo and remove_photo. Strava's API cannot upload
 * photos, so photos added here live in the public `training-photos` bucket
 * and in the activity's `photos` list next to the Strava photos; the site
 * shows both, the Strava app shows only its own. Strava photos are
 * read-only here. Images come in as a URL the server can fetch (for example
 * a Telegram file URL) or as base64 and are checked by their magic bytes.
 * Every list change goes through `updateActivityPhotos`, which retries if a
 * Strava resync lands at the same moment. Server only.
 */

const FETCH_TIMEOUT_MS = 20_000;

/** Fetch a remote image, refusing anything over the size limit without buffering it all. */
async function fetchImage(raw: string): Promise<{ bytes: Uint8Array; declared: string | null }> {
  const url = checkImageUrl(raw);
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: "image/*" } });
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "failed";
    throw new McpToolError(`Fetching the image from ${redactUrl(url)} ${reason}. Send it as image_base64 instead.`);
  }
  if (!res.ok) throw new McpToolError(`Fetching the image from ${redactUrl(url)} returned HTTP ${res.status}.`);
  const length = Number(res.headers.get("content-length") ?? "0");
  if (length > MAX_PHOTO_BYTES) throw new McpToolError(`The image is ${(length / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`);
  if (!res.body) throw new McpToolError("The image response had no body.");

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PHOTO_BYTES) {
      await reader.cancel();
      throw new McpToolError(`The image is larger than ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return { bytes, declared: res.headers.get("content-type") };
}

interface ImageArgs {
  image_url?: string | null;
  image_base64?: string | null;
  mime_type?: string | null;
}

function hasImage(args: ImageArgs): { url: boolean; data: boolean } {
  return { url: Boolean(args.image_url && args.image_url.trim()), data: Boolean(args.image_base64 && args.image_base64.trim()) };
}

/** Read, validate and store one image for `activity`; returns the new photo (not yet in the list). */
async function storeImage(activity: Activity, args: ImageArgs, caption: string | null) {
  const { url } = hasImage(args);
  const input = url ? await fetchImage(args.image_url!) : decodeBase64Image(args.image_base64!);
  const { mime, dimensions } = validateImage(input.bytes, args.mime_type ?? input.declared);
  const photoId = `${UPLOADED_PHOTO_PREFIX}${randomUUID()}`;
  const publicUrl = await uploadPhoto(storagePath(activity.athlete, activity.id, photoId, mime), input.bytes, mime);
  const photo: ActivityPhoto = {
    id: photoId,
    url: publicUrl,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    caption,
  };
  return { photo, mime, bytes: input.bytes.length };
}

/** Short description of an activity, for candidate lists. */
function candidate(a: Activity) {
  const bucket = bucketOf(a.sport);
  return { id: a.id, date: a.date, sport: bucket, sport_label: BUCKET_LABEL[bucket], name: a.name, start_local: a.startLocal, photos: a.photos.length };
}

type Resolved = { activity: Activity } | { candidates: ReturnType<typeof candidate>[]; reason: string };

/**
 * The activity a photo targets: by Strava id, or the athlete's single
 * activity on a date (optionally narrowed to a sport bucket). Zero or
 * several matches come back as candidates instead of a guess.
 */
async function resolveActivity(args: { activity_id?: string | number | null; date?: string | null; sport?: SportBucket | null }): Promise<Resolved> {
  if (args.activity_id !== undefined && args.activity_id !== null && String(args.activity_id).trim() !== "") {
    return { activity: await requireActivity(parseActivityId(args.activity_id)) };
  }
  if (!args.date) throw new McpToolError("Pass activity_id (from list_activities), or date (optionally with sport) to attach to that day's activity.");
  const day = assertDate(args.date, "date");
  const sameDay = await listActivities({ athlete: ATHLETE, from: day, to: day });
  const target = pickPhotoTarget(sameDay, { date: day, sport: args.sport }, bucketOf);
  if (target.kind === "one") return { activity: target.activity };
  const what = args.sport ? `${BUCKET_LABEL[args.sport].toLowerCase()} activity` : "activity";
  if (target.kind === "none") {
    return {
      candidates: args.sport ? sameDay.map(candidate) : [],
      reason: `There is no ${what} on ${day}${args.sport && sameDay.length > 0 ? " (the other activities that day are listed)" : ""}. If the session was recorded, call resync_strava; if it was never recorded, create it with log_activities. Then retry with the activity id.`,
    };
  }
  return { candidates: target.candidates.map(candidate), reason: `There are ${target.candidates.length} ${what === "activity" ? "activities" : `${what}s`} on ${day}. Ask which one and call again with its activity_id.` };
}

export async function addPhoto(args: ImageArgs & {
  activity_id?: string | number | null;
  date?: string | null;
  sport?: SportBucket | null;
  caption?: string | null;
}) {
  const has = hasImage(args);
  if (has.url === has.data) throw new McpToolError("Pass exactly one of image_url or image_base64.");
  const caption = args.caption?.trim() ? args.caption.trim() : null;

  const resolved = await resolveActivity(args);
  if (!("activity" in resolved)) {
    return { attached: false, reason: resolved.reason, candidates: resolved.candidates };
  }
  const { activity } = resolved;
  const stored = await storeImage(activity, args, caption);
  const photos = await updateActivityPhotos(activity.id, (current) => [...current, stored.photo]);
  if (!photos) {
    await removeStoredPhotos([stored.photo]);
    throw new McpToolError(`Activity ${activity.id} disappeared (deleted on Strava?) before the photo was saved.`);
  }
  invalidateTraining();

  return {
    attached: true,
    activity_id: activity.id,
    date: activity.date,
    activity_name: activity.name,
    photo: compactPhoto(stored.photo, photos.findIndex((p) => p.id === stored.photo.id)),
    mime_type: stored.mime,
    bytes: stored.bytes,
    note: "Shown on the website with this activity. It is not added to the Strava app (Strava's API cannot upload photos).",
    warning: stored.mime === "image/heic" ? "HEIC was stored as is; most browsers cannot display it. Prefer sending JPEG." : null,
  };
}

/**
 * Change one added photo (caption, or replace its image) and/or reorder the
 * added photos. A replaced image gets a new photo id and file, in the same
 * position; the old file is deleted once the list is saved.
 */
export async function updatePhoto(args: ImageArgs & {
  activity_id: string | number;
  photo_id?: string | null;
  caption?: string | null;
  order?: string[] | null;
}) {
  const id = parseActivityId(args.activity_id);
  const activity = await requireActivity(id);
  const has = hasImage(args);
  if (has.url && has.data) throw new McpToolError("Pass at most one of image_url or image_base64.");
  const replacing = has.url || has.data;

  // Fail fast on a bad request before any upload.
  applyPhotoEdit(activity.photos, {
    photo_id: args.photo_id,
    caption: args.caption,
    order: args.order,
    replacement: replacing ? { id: "upload-check", url: "", width: null, height: null, caption: null } : null,
  });

  const stored = replacing ? await storeImage(activity, args, null) : null;
  let replaced: ActivityPhoto | null = null;
  let photos: ActivityPhoto[] | null;
  try {
    photos = await updateActivityPhotos(id, (current) => {
      if (stored) replaced = current.find((p) => p.id === args.photo_id?.trim()) ?? null;
      return applyPhotoEdit(current, { photo_id: args.photo_id, caption: args.caption, order: args.order, replacement: stored?.photo ?? null });
    });
  } catch (err) {
    if (stored) await removeStoredPhotos([stored.photo]);
    throw err;
  }
  if (!photos) {
    if (stored) await removeStoredPhotos([stored.photo]);
    throw new McpToolError(`Activity ${id} disappeared (deleted on Strava?) before the change was saved.`);
  }
  invalidateTraining();
  const cleanupFailed = replaced ? await removeStoredPhotos([replaced]) : [];

  return {
    activity_id: activity.id,
    photos: photos.map(compactPhoto),
    replaced_photo_id: stored && replaced ? (replaced as ActivityPhoto).id : null,
    new_photo_id: stored?.photo.id ?? null,
    storage_cleanup_failed: cleanupFailed,
  };
}

export async function removePhoto(args: { activity_id: string | number; photo_id: string }) {
  const id = parseActivityId(args.activity_id);
  const activity = await requireActivity(id);
  withoutPhoto(activity.photos, args.photo_id); // validate before writing
  let removed: ActivityPhoto | null = null;
  const photos = await updateActivityPhotos(id, (current) => {
    const next = withoutPhoto(current, args.photo_id);
    removed = next.removed;
    return next.photos;
  });
  if (!photos || !removed) throw new McpToolError(`Activity ${id} disappeared (deleted on Strava?) before the change was saved.`);
  invalidateTraining();
  const failed = await removeStoredPhotos([removed]);
  return {
    activity_id: activity.id,
    removed: (removed as ActivityPhoto).id,
    photos: photos.map(compactPhoto),
    storage_cleanup_failed: failed,
  };
}
