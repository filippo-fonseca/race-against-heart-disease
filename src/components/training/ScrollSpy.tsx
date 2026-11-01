"use client";

import { useEffect } from "react";

/**
 * Watches the week sections in the log and tells the chart rail which week
 * is being read. Writes `data-active-week` on the page root, toggles
 * `data-active` on every `[data-week]` chart mark, and fills the readout.
 * Nothing re-renders; it is attribute flips only.
 */
export function ScrollSpy({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-week-section]"));
    const marks = Array.from(root.querySelectorAll<HTMLElement | SVGElement>("[data-week]"));
    const readouts = Array.from(root.querySelectorAll<HTMLElement>("[data-week-readout]"));
    if (sections.length === 0) return;

    const visible = new Map<HTMLElement, number>();
    let current = "";

    const apply = (week: string, label: string) => {
      if (week === current) return;
      current = week;
      root.dataset.activeWeek = week;
      for (const m of marks) {
        if (m.getAttribute("data-week") === week) m.setAttribute("data-active", "true");
        else m.removeAttribute("data-active");
      }
      for (const r of readouts) r.textContent = label;
    };

    const pick = () => {
      // The topmost section that still has part of itself in the reading band wins.
      let best: HTMLElement | null = null;
      let bestTop = Infinity;
      for (const [el] of visible) {
        const top = el.getBoundingClientRect().top;
        if (top < bestTop) {
          bestTop = top;
          best = el;
        }
      }
      if (best) apply(best.dataset.weekSection ?? "", best.dataset.weekLabel ?? "");
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          if (e.isIntersecting) visible.set(el, e.intersectionRatio);
          else visible.delete(el);
        }
        pick();
      },
      // A band from 15% to 55% down the viewport: what the eye is on.
      { rootMargin: "-15% 0px -45% 0px", threshold: [0, 0.01, 0.5, 1] },
    );
    for (const s of sections) io.observe(s);

    return () => io.disconnect();
  }, [rootId]);

  return null;
}
