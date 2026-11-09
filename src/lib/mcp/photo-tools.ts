import { randomUUID } from "node:crypto";
import { db } from "../training/db";
import { isUploadedPhoto, UPLOADED_PHOTO_PREFIX } from "../training/photos";
import { listActivities } from "../training/queries";
import type { Activity, ActivityPhoto, AthleteSlug } from "../training/types";
import { parseActivityId, requireActivity } from "./activity-tools";
import { invalidateTraining } from "./cache";
import { checkImageUrl, decodeBase64Image, MAX_PHOTO_BYTES, redactUrl, storagePath, validateImage } from "./photo-logic";
import { removeStoredPhotos, uploadPhoto } from "./photo-storage";
import { assertDate, McpToolError } from "./validate";

/**
 * add_photo and remove_photo. Images come in as a URL the server can fetch
 * (for example a Telegram file URL) or as base64, are checked by their magic
 * bytes, stored in the public `training-photos` bucket, and appended to the
 * activity's `photos`. Server only.
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

/** The activity a photo belongs to: by id, or the athlete's single activity on a date. */
async function resolveActivity(args: { activity_id?: string | number | null; date?: string | null; athlete: AthleteSlug }): Promise<Activity> {
  if (args.activity_id !== undefined && args.activity_id !== null && String(args.activity_id).trim() !== "") {
    const activity = await requireActivity(parseActivityId(args.activity_id));
    if (activity.athlete !== args.athlete) {
      throw new McpToolError(`Activity ${activity.id} belongs to ${activity.athlete}, not ${args.athlete}.`);
    }
    return activity;
  }
  if (!args.date) throw new McpToolError("Pass activity_id, or date (with athlete) to attach to that day's activity.");
  const day = assertDate(args.date, "date");
  const candidates = await listActivities({ athlete: args.athlete, from: day, to: day });
  if (candidates.length === 0) {
    throw new McpToolError(`${args.athlete} has no activity on ${day}. If the session is not on Strava, create it with log_activities first, then attach the photo to the returned id.`);
  }
  if (candidates.length > 1) {
    const list = candidates.map((a) => `${a.id} (${a.sport}, "${a.name}", ${a.startLocal})`).join("; ");
    throw new McpToolError(`${args.athlete} has ${candidates.length} activities on ${day}: ${list}. Ask which one and pass activity_id.`);
  }
  return candidates[0];
}

async function savePhotos(id: string, photos: ActivityPhoto[]): Promise<void> {
  const { error } = await db()
    .from("activities")
    .update({ photos, updated_at: new Date().toISOString() })
    .eq("id", Number(id));
  if (error) throw error;
}

export async function addPhoto(args: {
  activity_id?: string | number | null;
  date?: string | null;
  athlete: AthleteSlug;
  image_url?: string | null;
  image_base64?: string | null;
  mime_type?: string | null;
  caption?: string | null;
}) {
  const hasUrl = Boolean(args.image_url && args.image_url.trim());
  const hasData = Boolean(args.image_base64 && args.image_base64.trim());
  if (hasUrl === hasData) throw new McpToolError("Pass exactly one of image_url or image_base64.");

  const activity = await resolveActivity(args);
  const input = hasUrl ? await fetchImage(args.image_url!) : decodeBase64Image(args.image_base64!);
  const { mime, dimensions } = validateImage(input.bytes, args.mime_type ?? input.declared);

  const photoId = `${UPLOADED_PHOTO_PREFIX}${randomUUID()}`;
  const url = await uploadPhoto(storagePath(activity.athlete, activity.id, photoId, mime), input.bytes, mime);
  const photo: ActivityPhoto = {
    id: photoId,
    url,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    caption: args.caption?.trim() ? args.caption.trim() : null,
  };
  // Re-read so a concurrent edit to the photo list is not lost.
  const fresh = await requireActivity(Number(activity.id));
  await savePhotos(activity.id, [...fresh.photos, photo]);
  invalidateTraining();

  return {
    activity_id: activity.id,
    athlete: activity.athlete,
    date: activity.date,
    activity_name: activity.name,
    photo,
    mime_type: mime,
    bytes: input.bytes.length,
    warning: mime === "image/heic" ? "HEIC was stored as is; most browsers cannot display it. Prefer sending JPEG." : null,
  };
}

export async function removePhoto(args: { activity_id: string | number; photo_id: string }) {
  const id = parseActivityId(args.activity_id);
  const activity = await requireActivity(id);
  const photo = activity.photos.find((p) => p.id === args.photo_id);
  if (!photo) {
    const ids = activity.photos.map((p) => p.id).join(", ") || "none";
    throw new McpToolError(`Activity ${id} has no photo ${args.photo_id}. Its photos: ${ids}.`);
  }
  await savePhotos(activity.id, activity.photos.filter((p) => p.id !== photo.id));
  invalidateTraining();
  const failed = await removeStoredPhotos([photo]);
  return {
    activity_id: activity.id,
    removed: photo.id,
    storage_cleanup_failed: failed,
    warning: isUploadedPhoto(photo)
      ? null
      : "This photo came from Strava: the next detail sync of this activity restores it unless it is removed on Strava too.",
  };
}
