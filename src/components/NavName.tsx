"use client";

import { useEffect, useState } from "react";

/** Height of the floating bar plus its top gap, so "scrolled past" means past the bar, not the window edge. */
const BAR_OFFSET_PX = 76;

/**
 * The site name in the navbar. With `revealAfterId`, it stays hidden while that
 * element (the page's own hero) is on screen and fades in once it has scrolled
 * up behind the bar; without it, the name always shows.
 */
export function NavName({ name, revealAfterId }: { name: string; revealAfterId?: string }) {
  const [shown, setShown] = useState(!revealAfterId);

  useEffect(() => {
    if (!revealAfterId) return;
    const el = document.getElementById(revealAfterId);
    if (!el) return;
    // A passive scroll check is a single rect read; it also runs where intersection events are throttled.
    const check = () => setShown(el.getBoundingClientRect().bottom < BAR_OFFSET_PX);
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [revealAfterId]);

  return (
    <span
      aria-hidden={!shown}
      className={`hidden font-serif text-[16px] font-bold tracking-tight transition-[opacity,transform] duration-300 ease-out sm:inline ${
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"
      }`}
    >
      {name}
    </span>
  );
}
