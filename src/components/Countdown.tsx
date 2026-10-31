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

/** Days until race morning. Server renders blank; client fills in after hydration. */
export function Countdown({ className = "" }: { className?: string }) {
  const days = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const text =
    days === null
      ? " "
      : days === 0
        ? "Race day."
        : `T-minus ${days.toLocaleString()} ${days === 1 ? "day" : "days"}`;

  return <span className={className}>{text}</span>;
}
