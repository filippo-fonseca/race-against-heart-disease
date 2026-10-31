"use client";

import { useEffect, useState } from "react";
import { site } from "@/lib/site";

const DAY = 86_400_000;

function daysUntil(date: Date) {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / DAY));
}

/** Days until race morning. Rendered client-side to avoid a hydration mismatch. */
export function Countdown({ className = "" }: { className?: string }) {
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    setDays(daysUntil(site.race.date));
    const id = setInterval(() => setDays(daysUntil(site.race.date)), 60_000);
    return () => clearInterval(id);
  }, []);

  const text =
    days === null
      ? " "
      : days === 0
        ? "Race day."
        : `T-minus ${days.toLocaleString()} ${days === 1 ? "day" : "days"}`;

  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}
