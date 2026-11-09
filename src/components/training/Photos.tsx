"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityPhoto } from "@/lib/training/types";

/** Most tiles a gallery shows before the last one turns into "+N". */
const MAX_TILES = 6;

function ratioOf(p: ActivityPhoto): number {
  return p.width && p.height ? p.width / p.height : 3 / 2;
}

function altFor(p: ActivityPhoto, alt: string, i: number, n: number): string {
  if (p.caption) return p.caption;
  return n > 1 ? `${alt}, photo ${i + 1} of ${n}` : `${alt}, photo`;
}

/** How many tiles to show and how to lay them out, by photo count. */
function layout(n: number): { shown: number; cols: string; aspect: string } {
  if (n === 2) return { shown: 2, cols: "grid-cols-2", aspect: "aspect-[4/5] sm:aspect-square" };
  if (n === 3) return { shown: 3, cols: "grid-cols-3", aspect: "aspect-square" };
  if (n === 4) return { shown: 4, cols: "grid-cols-2", aspect: "aspect-[4/3]" };
  // Five or more: full rows of three, the last tile carrying the overflow.
  const shown = n >= MAX_TILES ? MAX_TILES : 3;
  return { shown, cols: "grid-cols-3", aspect: "aspect-square" };
}

/**
 * An activity's photos, full-bleed at the foot of its card: Strava's and any
 * attached through the MCP (both live in `activity.photos`). One photo shows
 * large at its own aspect (clamped between square and 16:9); several form a
 * tidy grid with a "+N" tile when there are more than fit. Every box has its
 * size before the image loads, so nothing shifts. Each tile opens a lightbox.
 * No photos renders nothing at all.
 */
export function Photos({ photos, alt }: { photos: ActivityPhoto[]; alt: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const n = photos.length;
  if (n === 0) return null;

  if (n === 1) {
    const p = photos[0];
    const ratio = Math.min(16 / 9, Math.max(1, ratioOf(p)));
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(0)}
          aria-label={`Open ${altFor(p, alt, 0, 1)}`}
          className="group relative block w-full cursor-zoom-in overflow-hidden bg-desk focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red"
          style={{ aspectRatio: String(ratio) }}
        >
          <Image
            src={p.url}
            alt={altFor(p, alt, 0, 1)}
            fill
            sizes="(min-width: 1024px) 760px, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.015]"
          />
        </button>
        {open !== null ? <Lightbox photos={photos} alt={alt} index={open} onIndex={setOpen} onClose={() => setOpen(null)} /> : null}
      </>
    );
  }

  const { shown, cols, aspect } = layout(n);
  const extra = n - shown;
  return (
    <>
      <ul className={`grid ${cols} gap-[2px] bg-paper`}>
        {photos.slice(0, shown).map((p, i) => {
          const overflow = extra > 0 && i === shown - 1;
          return (
            <li key={p.id} className={`relative ${aspect}`}>
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-label={overflow ? `Open photo ${i + 1} of ${n}, ${extra} more` : `Open ${altFor(p, alt, i, n)}`}
                className="group absolute inset-0 block cursor-zoom-in overflow-hidden bg-desk focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red"
              >
                <Image
                  src={p.url}
                  alt={altFor(p, alt, i, n)}
                  fill
                  sizes={cols === "grid-cols-2" ? "(min-width: 1024px) 380px, 50vw" : "(min-width: 1024px) 260px, 34vw"}
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
                {overflow ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-[rgba(20,20,20,0.55)] font-mono text-[1.4rem] text-white">
                    +{extra}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {open !== null ? <Lightbox photos={photos} alt={alt} index={open} onIndex={setOpen} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

/**
 * Modal viewer on the native <dialog>: Escape closes (the browser's cancel),
 * focus moves to the close button on open and back to the tile on close, the
 * arrow keys step through, and a click on the backdrop closes.
 */
function Lightbox({
  photos,
  alt,
  index,
  onIndex,
  onClose,
}: {
  photos: ActivityPhoto[];
  alt: string;
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const n = photos.length;
  const p = photos[index];
  const step = useCallback((d: number) => onIndex((index + d + n) % n), [index, n, onIndex]);
  // Close through the dialog itself; its close event tells the parent to unmount us.
  const close = () => ref.current?.close();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // The tile that opened us; focus goes back to it when we unmount.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    closeRef.current?.focus();
    // No dialog.close() here: its close event would unmount us (and Strict
    // Mode's rehearsal cleanup would shut the dialog it just opened). Removing
    // the element takes it out of the top layer anyway.
    return () => opener?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={altFor(p, alt, index, n)}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (n > 1 && e.key === "ArrowRight") step(1);
        if (n > 1 && e.key === "ArrowLeft") step(-1);
      }}
      className="m-auto h-dvh max-h-none w-screen max-w-none bg-transparent p-0 backdrop:bg-[rgba(10,10,10,0.88)]"
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4 py-14" onClick={(e) => e.target === e.currentTarget && close()}>
        <div className="relative h-full w-full max-w-[1200px]">
          <Image key={p.id} src={p.url} alt={altFor(p, alt, index, n)} fill sizes="100vw" className="object-contain" />
        </div>
        <div className="flex items-center gap-4 font-mono text-[0.8rem] text-white">
          {n > 1 ? (
            <button type="button" onClick={() => step(-1)} className="rounded-full px-3 py-1.5 ring-1 ring-white hover:bg-white hover:text-ink" aria-label="Previous photo">
              ←
            </button>
          ) : null}
          <span aria-live="polite">
            {p.caption ? `${p.caption} · ` : ""}
            {n > 1 ? `${index + 1} / ${n}` : ""}
          </span>
          {n > 1 ? (
            <button type="button" onClick={() => step(1)} className="rounded-full px-3 py-1.5 ring-1 ring-white hover:bg-white hover:text-ink" aria-label="Next photo">
              →
            </button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        ref={closeRef}
        onClick={close}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[1.3rem] leading-none text-ink"
        aria-label="Close photo"
      >
        ×
      </button>
    </dialog>
  );
}
