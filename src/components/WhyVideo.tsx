import { site } from "@/lib/site";
import { youtubeId } from "@/lib/video";
import { YouTubeLite } from "./YouTubeLite";

/**
 * "Why I'm doing this" video on the letter. Renders nothing until
 * `site.video.url` holds a YouTube link (any form: watch, youtu.be, Shorts).
 */
export function WhyVideo({ className = "" }: { className?: string }) {
  const id = youtubeId(site.video.url);
  if (!id) return null;
  return (
    <section className={className} aria-label={site.video.title}>
      <div className="label mb-3 text-center">{site.video.title}</div>
      <YouTubeLite id={id} title={site.video.title} vertical={site.video.vertical} />
    </section>
  );
}
