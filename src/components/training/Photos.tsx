import Image from "next/image";
import type { ActivityPhoto } from "@/lib/training/types";

/** Tight row of Strava photos. Fixed height, natural aspect, hairline edge. */
export function Photos({ photos, alt }: { photos: ActivityPhoto[]; alt: string }) {
  if (photos.length === 0) return null;
  return (
    <ul className="mt-3 flex gap-1.5 overflow-x-auto">
      {photos.map((p, i) => {
        const w = p.width ?? 600;
        const h = p.height ?? 400;
        const displayH = 112;
        const displayW = Math.round((w / h) * displayH);
        return (
          <li key={p.id} className="shrink-0">
            <Image
              src={p.url}
              alt={p.caption ?? `${alt}, photo ${i + 1}`}
              width={displayW}
              height={displayH}
              sizes={`${displayW}px`}
              className="block h-[112px] w-auto bg-desk shadow-[0_0_0_1px_rgba(23,20,18,0.08)]"
            />
          </li>
        );
      })}
    </ul>
  );
}
