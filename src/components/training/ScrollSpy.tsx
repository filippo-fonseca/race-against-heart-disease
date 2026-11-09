"use client";

import { useEffect } from "react";

/** The reading line, as a fraction of the viewport height from the top. */
const READING_LINE = 0.35;

/**
 * Watches the week sections in the feed and tells the chart rail which week
 * is being read: the last section whose top has crossed the reading line
 * (35% down the viewport), or the first section before any has. Writes
 * `data-active-week` on the page root, toggles `data-active` on every
 * `[data-week]` chart mark (the week bands, bars and calendar brackets), and
 * fills the readout. Nothing re-renders; it is attribute flips only.
 */
export function ScrollSpy({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-week-section]"));
    const marks = Array.from(root.querySelectorAll<HTMLElement | SVGElement>("[data-week]"));
    const readouts = Array.from(root.querySelectorAll<HTMLElement>("[data-week-readout]"));
    if (sections.length === 0) return;

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

    let frame = 0;
    const pick = () => {
      frame = 0;
      const line = window.innerHeight * READING_LINE;
      let best = sections[0];
      for (const s of sections) {
        if (s.getBoundingClientRect().top <= line) best = s;
        else break; // sections are in document order
      }
      apply(best.dataset.weekSection ?? "", best.dataset.weekLabel ?? "");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(pick);
    };

    pick();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [rootId]);

  return null;
}
