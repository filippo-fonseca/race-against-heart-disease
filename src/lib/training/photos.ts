import type { ActivityPhoto } from "./types";

/**
 * Photos uploaded through the MCP server (src/lib/mcp/photo-tools.ts) sit in
 * an activity's `photos` array next to Strava's. Their ids carry this prefix
 * so a Strava resync, which rewrites the array from Strava's photo list, can
 * carry them over instead of dropping them.
 */
export const UPLOADED_PHOTO_PREFIX = "upload-";

export function isUploadedPhoto(photo: Pick<ActivityPhoto, "id">): boolean {
  return photo.id.startsWith(UPLOADED_PHOTO_PREFIX);
}

/** `next` (fresh from Strava) followed by any uploaded photos from `previous` it lacks. */
export function keepUploadedPhotos(next: ActivityPhoto[], previous: ActivityPhoto[] | null | undefined): ActivityPhoto[] {
  if (!Array.isArray(previous) || previous.length === 0) return next;
  const ids = new Set(next.map((p) => p.id));
  const kept = previous.filter((p) => isUploadedPhoto(p) && !ids.has(p.id));
  return kept.length === 0 ? next : [...next, ...kept];
}
