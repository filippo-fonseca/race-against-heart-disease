"use client";

import { useSyncExternalStore } from "react";
import { site } from "@/lib/site";

const DAY = 86_400_000;

function daysUntil(date: Date) {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / DAY));
}

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
}

const getSnapshot = () => daysUntil(site.race.date);
const getServerSnapshot = () => null;

/** Days until race morning, or null on the server (filled in after hydration). */
function useDaysToRace() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** "T-minus 147 days". Server renders blank; client fills in after hydration. */
export function Countdown({ className = "" }: { className?: string }) {
  const days = useDaysToRace();

  const text =
    days === null
      ? " "
      : days === 0
        ? "Race day."
        : `T-minus ${days.toLocaleString()} ${days === 1 ? "day" : "days"}`;

  return <span className={className}>{text}</span>;
}

/** Just the number, for the big figure. A non-breaking space holds the line height until hydration. */
export function CountdownDays({ className = "" }: { className?: string }) {
  const days = useDaysToRace();
  return <span className={className}>{days === null ? " " : days.toLocaleString()}</span>;
}
