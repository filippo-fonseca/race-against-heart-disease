import Image from "next/image";
import { site } from "@/lib/site";

interface Postcard {
  src: string;
  w: number;
  h: number;
  caption: string;
  alt: string;
}

/** From the robots and the cardio research to the races. Order is the story. */
const CARDS: Postcard[] = [
  { src: "/gallery/01-lab-night.jpg", w: 675, h: 900, caption: "late nights in the lab", alt: "Filippo in headphones at a desk of monitors in an engineering lab at night" },
  { src: "/gallery/02-robot-arm.jpg", w: 900, h: 723, caption: "mechatronics work", alt: "Filippo assembling a metal robot arm on a workbench full of wiring" },
  { src: "/gallery/03-robot.jpg", w: 675, h: 900, caption: "i love robots", alt: "A hand reaching toward a black and orange humanoid robot" },
  { src: "/gallery/04-heart-model.jpg", w: 722, h: 900, caption: "mapping the heart", alt: "A monitor showing a hand-drawn diagram of the heart's chambers beside code" },
  { src: "/gallery/05-wet-lab.jpg", w: 595, h: 900, caption: "feeding heart tissue", alt: "Filippo in a blue lab coat and pink gloves working in a biosafety cabinet" },
  { src: "/gallery/06-gloved-up.jpg", w: 671, h: 900, caption: "gloved up", alt: "Filippo in a lab coat giving a thumbs up with a pink glove" },
  { src: "/gallery/07-mgh.jpg", w: 675, h: 900, caption: "summer at Mass General Hospital doing biomedical research", alt: "The Massachusetts General Hospital building against a blue sky" },
  { src: "/gallery/08-suit.jpg", w: 675, h: 900, caption: "suit and badge", alt: "Filippo in a blue suit with a hospital badge giving a thumbs up" },
  { src: "/gallery/09-half-marathon.jpg", w: 562, h: 900, caption: "Baystate Half, 1:23 PR", alt: "Filippo running a half marathon in a neon shirt, Strava stats overlaid" },
  { src: "/gallery/10-finish.jpg", w: 675, h: 900, caption: "medal on + family!", alt: "Filippo wearing a finisher medal after a race, with family beside him" },
  { src: "/gallery/11-paris.jpg", w: 675, h: 900, caption: "Paris, mid-run", alt: "Filippo standing near the Eiffel Tower in running clothes under a cloudy sky" },
  { src: "/gallery/12-bike.jpg", w: 675, h: 900, caption: "indoor miles", alt: "Filippo on an indoor bike in a gym, wearing headphones" },
  { src: "/gallery/13-lift.jpg", w: 821, h: 900, caption: "strength days", alt: "Filippo lifting a barbell in a gym" },
  { src: "/gallery/14-shoes.jpg", w: 523, h: 900, caption: "my true love is running 😅", alt: "Running shoes on, legs tanned from training" },
];

/** Small fixed tilts so the stack looks hand-placed but renders the same every time. */
const TILT = [-2.2, 1.6, -1, 2.4, -1.8, 1.1, -2.6, 1.9, -1.3, 2.1, -0.8, 1.4, -2, 1.2];

/**
 * The "about me" section of the letter: the author's words beside a gallery of
 * photo postcards (white border, handwritten caption, slight tilt).
 */
export function Postcards({ className = "" }: { className?: string }) {
  return (
    <section className={className} aria-labelledby="postcards-title">
      <div className="mx-auto max-w-[640px] px-1">
        <div className="label text-center">Postcards</div>
        <h2 id="postcards-title" className="mt-2 text-center font-serif text-[1.6rem] leading-tight tracking-tight sm:text-[1.9rem]">
          From building robots to running races
        </h2>
        <div className="mt-6 space-y-4 text-justify font-serif text-[1.12rem] leading-relaxed text-ink hyphens-auto">
          {site.author.about.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </div>
      </div>

      <ul className="mt-10 columns-2 gap-4 sm:columns-3 sm:gap-6 lg:columns-4" aria-label="Photo postcards">
        {CARDS.map((c, i) => (
          <li key={c.src} className="mb-5 break-inside-avoid sm:mb-7">
            <figure
              className="postcard rounded-[3px] bg-paper p-2 pb-1 shadow-[0_1px_2px_rgba(20,20,20,0.08),0_10px_24px_-10px_rgba(20,20,20,0.28)] sm:p-2.5 sm:pb-1.5"
              style={{ "--tilt": `${TILT[i % TILT.length]}deg` } as React.CSSProperties}
            >
              <Image
                src={c.src}
                alt={c.alt}
                width={c.w}
                height={c.h}
                sizes="(min-width: 1024px) 220px, (min-width: 640px) 30vw, 45vw"
                className="block h-auto w-full rounded-[2px] bg-desk"
              />
              <figcaption className="px-1 pb-0.5 pt-1.5 text-center font-hand text-[1.15rem] leading-tight text-ink sm:text-[1.3rem]">
                {c.caption}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
