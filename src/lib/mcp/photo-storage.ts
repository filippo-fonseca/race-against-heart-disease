import { db } from "../training/db";
import { isUploadedPhoto } from "../training/photos";
import type { ActivityPhoto } from "../training/types";
import { ALLOWED_MIME, MAX_PHOTO_BYTES, pathFromPublicUrl, PHOTO_BUCKET, type ImageMime } from "./photo-logic";

/**
 * Supabase Storage for uploaded training photos: one public bucket,
 * `training-photos`, created on first use with the service-role client.
 * Public because the site renders the photos to everyone, exactly like the
 * Strava CDN URLs next to them. Server only.
 */

let bucketReady = false;

export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const storage = db().storage;
  const { data } = await storage.getBucket(PHOTO_BUCKET);
  if (!data) {
    const { error } = await storage.createBucket(PHOTO_BUCKET, {
      public: true,
      fileSizeLimit: MAX_PHOTO_BYTES,
      allowedMimeTypes: [...ALLOWED_MIME],
    });
    // A concurrent request may have created it between the two calls.
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  bucketReady = true;
}

/** Upload bytes and return the public URL. */
export async function uploadPhoto(path: string, bytes: Uint8Array, mime: ImageMime): Promise<string> {
  await ensureBucket();
  const storage = db().storage.from(PHOTO_BUCKET);
  const { error } = await storage.upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "31536000" });
  if (error) throw error;
  return storage.getPublicUrl(path).data.publicUrl;
}

/**
 * Delete the stored objects behind uploaded photos (Strava photos are
 * skipped). Best effort: returns the paths it could not remove.
 */
export async function removeStoredPhotos(photos: ActivityPhoto[]): Promise<string[]> {
  const paths = photos
    .filter(isUploadedPhoto)
    .map((p) => pathFromPublicUrl(p.url))
    .filter((p): p is string => p !== null);
  if (paths.length === 0) return [];
  const { error } = await db().storage.from(PHOTO_BUCKET).remove(paths);
  if (error) {
    console.error("[mcp] photo cleanup failed:", error.message);
    return paths;
  }
  return [];
}
