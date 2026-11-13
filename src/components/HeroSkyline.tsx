import Link from "next/link";
import { Suspense } from "react";
import { Skyline3D } from "./training/Skyline3D";
import { loadSkylineDays } from "./training/skyline-data";

async function Scene() {
  const days = await loadSkylineDays();
  return <Skyline3D days={days} variant="hero" />;
}

/**
 * The 3D training skyline in the letter's hero, bleeding to the sheet's
 * edges, with a caption and a link to the full view. Data is read at request
 * time inside Suspense; the fallback holds the same height so nothing jumps.
 */
export function HeroSkyline({ className = "" }: { className?: string }) {
  return (
    <section className={className} aria-label="Every training day, in 3D">
      <div className="flex flex-col items-center text-center">
        <h2 className="font-serif text-[1.8rem] font-medium leading-tight tracking-tight text-ink sm:text-[2.3rem]">
          My method? Stacking days, <em className="text-red">literally</em> :)
        </h2>
        <p className="mt-3 max-w-[72ch] font-serif text-[1.02rem] leading-relaxed text-ink-soft sm:text-[1.1rem]">
          I had tons of fun building this 3D map of my training! It&apos;s synced to my Strava and updates in real time (so
          you know your funding is going to good use!).
        </p>
      </div>
      <div className="-mx-5 mt-6 sm:-mx-12 lg:-mx-16">
        <Suspense fallback={<div className="h-[460px] sm:h-[560px]" />}>
          <Scene />
        </Suspense>
      </div>
      <div className="flex justify-center">
        <Link href="/training/3d" className="label underline decoration-rule underline-offset-4 hover:text-red">
          Open the full 3D view →
        </Link>
      </div>
    </section>
  );
}
