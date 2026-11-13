/**
 * The YouTube video id in any common link form: watch?v=, youtu.be/,
 * /shorts/, /embed/ or /live/, or a bare 11-character id. Null otherwise.
 */
export function youtubeId(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (/^[\w-]{11}$/.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v");
    if (!id) {
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      id = m ? m[1] : null;
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}
