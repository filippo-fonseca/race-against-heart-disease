"use client";

import { useRef } from "react";
import Image from "next/image";
import { site } from "@/lib/site";

/**
 * "About me" button that opens a native <dialog> modal. The browser handles
 * focus trapping, Escape to close and the backdrop; a click on the backdrop
 * (outside the panel) also closes it.
 */
export function AboutModal({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-haspopup="dialog"
        className={`inline-flex h-8 items-center gap-1.5 rounded-full bg-paper px-3.5 text-[0.85rem] font-semibold text-ink shadow-[0_0_0_1px_var(--rule),0_1px_2px_rgba(20,20,20,0.06)] transition-[background-color,transform] hover:bg-desk active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red ${className}`}
      >
        About me
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
          <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <dialog
        ref={ref}
        aria-labelledby="about-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="about-modal m-auto w-[min(560px,calc(100vw-32px))] rounded-2xl bg-paper p-0 text-ink shadow-[0_24px_64px_-12px_rgba(20,20,20,0.35)]"
      >
        <div className="px-6 pb-6 pt-5 sm:px-8 sm:pb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image
                src={site.author.avatar}
                alt=""
                width={48}
                height={48}
                loading="eager"
                className="h-12 w-12 rounded-full border border-rule object-cover"
              />
              <div className="leading-tight">
                <h2 id="about-title" className="font-serif text-[1.2rem] font-bold">
                  {site.author.name}
                </h2>
                <div className="label mt-1">About me</div>
              </div>
            </div>
            <form method="dialog">
              <button
                type="submit"
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-desk hover:text-ink focus-visible:outline-2 focus-visible:outline-red"
              >
                <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </form>
          </div>
          <div className="mt-5 space-y-3.5 font-serif text-[1.08rem] leading-relaxed text-ink-soft">
            {site.author.about.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}
