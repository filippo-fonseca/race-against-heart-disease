"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** How long to wait for a day to render after loading more weeks. */
const WAIT_MS = 4000;

function scrollToHash(hash: string): boolean {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  if (!id) return false;
  const el = document.getElementById(id);
  if (!el) return false;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  return true;
}

/** Retry until the element exists (the feed streams in, or more weeks are loading). */
function scrollWhenReady(hash: string) {
  const deadline = Date.now() + WAIT_MS;
  const tick = () => {
    if (scrollToHash(hash) || Date.now() > deadline) return;
    setTimeout(tick, 50);
  };
  tick();
}

/**
 * Calendar day → its sessions in the feed. Intercepts clicks on `a.cal-day`
 * inside `rootId`: a day already rendered just scrolls into view; an older day
 * navigates in place to the page that renders its week (the link's ?weeks=N),
 * then scrolls once it appears. Also honours a `#day-…` hash on first load,
 * which the browser cannot do itself because the feed streams in after the
 * initial HTML.
 */
export function DayJump({ rootId }: { rootId: string }) {
  const router = useRouter();

  useEffect(() => {
    if (location.hash.startsWith("#day-")) scrollWhenReady(location.hash);

    const root = document.getElementById(rootId);
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a.cal-day");
      const href = link?.getAttribute("href");
      if (!href) return;
      e.preventDefault();
      const url = new URL(href, location.href);
      if (url.pathname === location.pathname && url.search === location.search) {
        history.replaceState(history.state, "", url.hash);
        scrollWhenReady(url.hash);
        return;
      }
      router.push(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
      scrollWhenReady(url.hash);
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [rootId, router]);

  return null;
}
