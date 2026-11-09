import { McpToolError } from "./validate";

/**
 * Pure image handling for add_photo: decode base64, recognise the format
 * from its magic bytes (never trusting a declared type alone), read pixel
 * dimensions so the log can lay photos out at their real aspect ratio, and
 * vet remote URLs before fetching. No network, no database.
 */

export const PHOTO_BUCKET = "training-photos";
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

export const ALLOWED_MIME: readonly ImageMime[] = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export const EXTENSION: Record<ImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "heif"]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  if (start + length > bytes.length) return "";
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** The image format from its leading bytes, or null when it is not one we accept. */
export function sniffImageType(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a) return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (ascii(bytes, 4, 4) === "ftyp" && HEIF_BRANDS.has(ascii(bytes, 8, 4))) return "image/heic";
  return null;
}

/** Normalise a declared MIME type ("image/jpg", "IMAGE/JPEG; q=1") to ours, or null. */
export function normaliseMime(declared: string | null | undefined): ImageMime | null {
  if (!declared) return null;
  const base = declared.split(";")[0].trim().toLowerCase();
  if (base === "image/jpg" || base === "image/pjpeg") return "image/jpeg";
  if (base === "image/heif") return "image/heic";
  return (ALLOWED_MIME as readonly string[]).includes(base) ? (base as ImageMime) : null;
}

/* ------------------------------------------------------------------ */
/* Dimensions                                                           */
/* ------------------------------------------------------------------ */

export interface Dimensions {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

/** EXIF orientation (1 to 8) from a JPEG APP1 segment body, or 1. */
function exifOrientation(b: Uint8Array, start: number, end: number): number {
  if (ascii(b, start, 6) !== "Exif\u0000\u0000") return 1;
  const tiff = start + 6;
  const little = ascii(b, tiff, 2) === "II";
  const r16 = (i: number) => (little ? u16le(b, i) : u16be(b, i));
  const r32 = (i: number) => (little ? (u16le(b, i) | (u16le(b, i + 2) << 16)) >>> 0 : u32be(b, i));
  const ifd = tiff + r32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const count = r16(ifd);
  for (let k = 0; k < count; k += 1) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > end) break;
    if (r16(entry) === 0x0112) return r16(entry + 8);
  }
  return 1;
}

function jpegSize(b: Uint8Array): Dimensions | null {
  let i = 2;
  let orientation = 1;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    const length = u16be(b, i + 2);
    if (marker === 0xe1) orientation = exifOrientation(b, i + 4, Math.min(b.length, i + 2 + length));
    // SOF0 to SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = u16be(b, i + 5);
      const width = u16be(b, i + 7);
      // Orientations 5 to 8 rotate by 90 degrees: the displayed image is transposed.
      return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
    }
    i += 2 + length;
  }
  return null;
}

function webpSize(b: Uint8Array): Dimensions | null {
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8X" && b.length >= 30) return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (chunk === "VP8L" && b.length >= 25) {
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8 " && b.length >= 30) return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  return null;
}

/** HEIF stores sizes in `ispe` boxes; the largest one is the primary image (smaller ones are thumbnails). */
function heicSize(b: Uint8Array): Dimensions | null {
  let best: Dimensions | null = null;
  const limit = Math.min(b.length - 16, 1 << 20);
  for (let i = 4; i < limit; i += 1) {
    if (b[i] === 0x69 && ascii(b, i, 4) === "ispe") {
      const width = u32be(b, i + 8);
      const height = u32be(b, i + 12);
      if (width > 0 && height > 0 && (!best || width * height > best.width * best.height)) best = { width, height };
    }
  }
  return best;
}

/** Display dimensions, or null when the header cannot be read. */
export function imageDimensions(bytes: Uint8Array, type: ImageMime): Dimensions | null {
  let d: Dimensions | null = null;
  if (type === "image/png" && bytes.length >= 24 && ascii(bytes, 12, 4) === "IHDR") d = { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  else if (type === "image/jpeg") d = jpegSize(bytes);
  else if (type === "image/webp") d = webpSize(bytes);
  else if (type === "image/heic") d = heicSize(bytes);
  return d && d.width > 0 && d.height > 0 ? d : null;
}

/* ------------------------------------------------------------------ */
/* Inputs                                                               */
/* ------------------------------------------------------------------ */

/**
 * Decode base64 (optionally a `data:image/...;base64,` URL; whitespace and
 * URL-safe characters tolerated). Returns the bytes and any MIME type the
 * data URL declared. Rejects input over MAX_PHOTO_BYTES before decoding.
 */
export function decodeBase64Image(input: string): { bytes: Uint8Array; declared: string | null } {
  let text = input.trim();
  let declared: string | null = null;
  const dataUrl = /^data:([^;,]+)?(;[^,]*)?,/i.exec(text);
  if (dataUrl) {
    declared = dataUrl[1] ?? null;
    if (!/;base64/i.test(dataUrl[2] ?? "")) throw new McpToolError("image_base64 data URLs must be base64 encoded.");
    text = text.slice(dataUrl[0].length);
  }
  text = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (text.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw new McpToolError("image_base64 is not valid base64.");
  if (Math.floor((text.length * 3) / 4) > MAX_PHOTO_BYTES + 3) throw new McpToolError(`The image is larger than ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`);
  return { bytes: new Uint8Array(Buffer.from(text, "base64")), declared };
}

/**
 * Check bytes are an accepted image within the size limit. The sniffed type
 * wins; a declared type that is not an image at all is an error.
 */
export function validateImage(bytes: Uint8Array, declared: string | null | undefined): { mime: ImageMime; dimensions: Dimensions | null } {
  if (bytes.length === 0) throw new McpToolError("The image is empty.");
  if (bytes.length > MAX_PHOTO_BYTES) throw new McpToolError(`The image is ${(bytes.length / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`);
  const mime = sniffImageType(bytes);
  if (!mime) {
    const hint = declared ? ` (declared ${declared})` : "";
    throw new McpToolError(`The file is not a JPEG, PNG, WebP or HEIC image${hint}.`);
  }
  return { mime, dimensions: imageDimensions(bytes, mime) };
}

function privateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * Parse and vet a URL before the server fetches it: http(s) only, no
 * credentials in the URL, and no localhost or private-network literals.
 */
export function checkImageUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new McpToolError("image_url is not a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new McpToolError("image_url must be http or https.");
  if (url.username || url.password) throw new McpToolError("image_url must not contain credentials.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipv6 = host.includes(":");
  const privateIPv6 = ipv6 && (host === "::" || host === "::1" || /^f[cd]/.test(host) || host.startsWith("fe80:") || host.startsWith("::ffff:"));
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") || privateIPv4(host) || privateIPv6) {
    throw new McpToolError("image_url must point to a public host.");
  }
  return url;
}

/** URL safe to show in errors: origin only, since paths can carry tokens (Telegram file URLs do). */
export function redactUrl(url: URL): string {
  return `${url.origin}/...`;
}

/** Object path in the bucket: `<athlete>/<activity id>/<photo id>.<ext>`. */
export function storagePath(athlete: string, activityId: string | number, photoId: string, mime: ImageMime): string {
  return `${athlete}/${activityId}/${photoId}.${EXTENSION[mime]}`;
}

/** The object path inside PHOTO_BUCKET for one of our public URLs, or null. */
export function pathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const path = url.slice(at + marker.length).split("?")[0];
  return path.length > 0 ? decodeURIComponent(path) : null;
}
