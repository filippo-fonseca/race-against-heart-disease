"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * A click-to-play YouTube embed. Until it is played it is only a thumbnail
 * and a button, so nothing from YouTube runs and no cookies are set; on play
 * it swaps in the privacy-enhanced (youtube-nocookie) player and starts it.
 */
export function YouTubeLite({ id, title, vertical = false }: { id: string; title: string; vertical?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const aspect = vertical ? "aspect-[9/16] max-w-[360px]" : "aspect-video max-w-[720px]";

  return (
    <div className={`video-frame relative mx-auto w-full overflow-hidden rounded-2xl bg-ink ${aspect}`}>
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1&modestbranding=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play video: ${title}`}
          className="group absolute inset-0 h-full w-full"
        >
          <Image
            src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
            alt=""
            fill
            sizes={vertical ? "360px" : "(min-width: 768px) 720px, 100vw"}
            className="object-cover opacity-90 transition-[opacity,transform] duration-500 group-hover:scale-[1.02] group-hover:opacity-100"
          />
          <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
          {/* Outer span centers; inner span carries the glow (cta-glow sets its own position). */}
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
            <span className="cta-glow flex h-16 w-16 items-center justify-center rounded-full text-paper group-hover:scale-105">
              <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor">
                <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
              </svg>
            </span>
          </span>
          <span className="label absolute bottom-3 left-4 !text-paper/90">{title}</span>
        </button>
      )}
    </div>
  );
}
