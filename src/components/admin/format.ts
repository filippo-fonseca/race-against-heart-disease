import type { PlanSession } from "@/lib/training/types";

/** Flat, printable view of a PlanSession for the preview tables. */
export const FIELD_LABELS: Record<string, string> = {
  date: "Date",
  sport: "Sport",
  title: "Title",
  detail: "Detail",
  targetMin: "Min",
  targetKm: "Km",
  athletes: "Athletes",
  phase: "Phase",
  week: "Week",
  id: "Id",
};

export function fieldValue(s: PlanSession, field: string): string {
  const v = (s as unknown as Record<string, unknown>)[field];
  if (v === null || v === undefined || v === "") return "blank";
  if (Array.isArray(v)) return v.length ? v.join(";") : "both";
  return String(v);
}

export function fmtStamp(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  }).format(d);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
