import { isUploadedPhoto } from "../training/photos";
import type { ActivityPhoto } from "../training/types";
import type { ISODate } from "../training/dates";
import { McpToolError } from "./validate";

/**
 * Pure rules for the photo tools: where a photo came from, which activity a
 * date-based add_photo means, and how update_photo / remove_photo change an
 * activity's photo list. No database, no network: tests import this.
 *
 * An activity's `photos` holds Strava's photos (synced, read-only here:
 * they change only in the Strava app) followed by photos uploaded through
 * the MCP server (ids starting with `upload-`, stored in Supabase Storage).
 * A Strava resync rewrites the Strava part and keeps the uploads after it,
 * in their stored order, so ordering only ever applies to the uploads.
 */

export type PhotoSource = "strava" | "mcp";

export function photoSource(photo: Pick<ActivityPhoto, "id">): PhotoSource {
  return isUploadedPhoto(photo) ? "mcp" : "strava";
}

/** LLM-facing view of one photo. `editable` is false for Strava photos. */
export function compactPhoto(photo: ActivityPhoto, index: number) {
  const source = photoSource(photo);
  return {
    id: photo.id,
    position: index + 1,
    source,
    editable: source === "mcp",
    url: photo.url,
    caption: photo.caption,
    width: photo.width,
    height: photo.height,
  };
}

/* ------------------------------------------------------------------ */
/* Date-based lookup for add_photo                                      */
/* ------------------------------------------------------------------ */

export type PhotoTarget<A> = { kind: "one"; activity: A } | { kind: "none" } | { kind: "many"; candidates: A[] };

/**
 * The activity a photo for `date` (and optionally a sport bucket) belongs
 * to. Exactly one match is attached to; zero or several are handed back so
 * the bot can ask instead of guessing. `bucket` maps a stored sport to its
 * bucket (anything but swim, bike or run is strength).
 */
export function pickPhotoTarget<A extends { date: string; sport: string }>(
  activities: A[],
  query: { date: ISODate; sport?: string | null },
  bucket: (sport: string) => string,
): PhotoTarget<A> {
  const matches = activities.filter((a) => a.date === query.date && (!query.sport || bucket(a.sport) === query.sport));
  if (matches.length === 1) return { kind: "one", activity: matches[0] };
  if (matches.length === 0) return { kind: "none" };
  return { kind: "many", candidates: matches };
}

/* ------------------------------------------------------------------ */
/* Editing the photo list                                               */
/* ------------------------------------------------------------------ */

export const MAX_CAPTION = 300;

export interface PhotoEdit {
  /** The photo to change (required for caption or replacement). */
  photo_id?: string | null;
  /** New caption; null or "" clears it; undefined keeps it. */
  caption?: string | null;
  /** A freshly uploaded photo that takes `photo_id`'s place (new id and url). */
  replacement?: ActivityPhoto | null;
  /** Every uploaded photo id, in the new order (Strava photos always come first). */
  order?: string[] | null;
}

function readOnly(id: string): McpToolError {
  return new McpToolError(`Photo ${id} comes from Strava and is read-only here: change or remove it in the Strava app and the site follows on the next sync. Only photos added through this server (ids starting with upload-) can be edited.`);
}

function findPhoto(photos: ActivityPhoto[], id: string): ActivityPhoto {
  const photo = photos.find((p) => p.id === id);
  if (!photo) {
    const ids = photos.map((p) => `${p.id} (${photoSource(p)})`).join(", ") || "none";
    throw new McpToolError(`This activity has no photo ${id}. Its photos: ${ids}.`);
  }
  return photo;
}

/** The photo list after an update_photo request. Throws on anything invalid or empty. */
export function applyPhotoEdit(photos: ActivityPhoto[], edit: PhotoEdit): ActivityPhoto[] {
  const changesPhoto = edit.caption !== undefined || Boolean(edit.replacement);
  const reorders = Array.isArray(edit.order);
  if (!changesPhoto && !reorders) throw new McpToolError("Nothing to update: pass caption, a new image, or order.");

  let next = [...photos];

  if (reorders) {
    const uploaded = next.filter(isUploadedPhoto);
    const order = edit.order!.map((id) => id.trim());
    const known = new Set(uploaded.map((p) => p.id));
    for (const id of order) {
      if (!known.has(id)) {
        if (next.some((p) => p.id === id)) throw readOnly(id);
        throw new McpToolError(`order lists ${id}, which is not a photo added to this activity.`);
      }
    }
    if (new Set(order).size !== order.length) throw new McpToolError("order lists a photo more than once.");
    if (order.length !== uploaded.length) {
      const missing = uploaded.filter((p) => !order.includes(p.id)).map((p) => p.id);
      throw new McpToolError(`order must list every added photo exactly once; missing: ${missing.join(", ")}.`);
    }
    const byId = new Map(uploaded.map((p) => [p.id, p]));
    next = [...next.filter((p) => !isUploadedPhoto(p)), ...order.map((id) => byId.get(id)!)];
  }

  if (changesPhoto) {
    const id = edit.photo_id?.trim();
    if (!id) throw new McpToolError("photo_id is required to change a caption or replace an image.");
    const current = findPhoto(next, id);
    if (!isUploadedPhoto(current)) throw readOnly(id);
    let caption = current.caption;
    if (edit.caption !== undefined) {
      const c = (edit.caption ?? "").trim();
      if (c.length > MAX_CAPTION) throw new McpToolError(`caption is longer than ${MAX_CAPTION} characters.`);
      caption = c || null;
    }
    const updated: ActivityPhoto = edit.replacement ? { ...edit.replacement, caption } : { ...current, caption };
    next = next.map((p) => (p.id === id ? updated : p));
  }

  return next;
}

/** The photo list without one added photo. Strava photos are refused. */
export function withoutPhoto(photos: ActivityPhoto[], photoId: string): { photos: ActivityPhoto[]; removed: ActivityPhoto } {
  const removed = findPhoto(photos, photoId);
  if (!isUploadedPhoto(removed)) throw readOnly(photoId);
  return { photos: photos.filter((p) => p.id !== photoId), removed };
}
