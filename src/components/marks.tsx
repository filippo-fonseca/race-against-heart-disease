import { site } from "@/lib/site";

type SvgProps = React.SVGProps<SVGSVGElement>;

/**
 * Campaign mark: a solid Y with a heart cut out of the junction. The hole is
 * a true knockout (evenodd), so the mark sits on any ground in one color.
 */
export const MARK_PATH = "M6 6H21L32 23L43 6H58L39 34V59H25V34Z M32 42C32 42 27 38.4 27 34.4C27 32 28.7 30.5 30.5 30.5C31.2 30.5 31.7 31 32 31.8C32.3 31 32.8 30.5 33.5 30.5C35.3 30.5 37 32 37 34.4C37 38.4 32 42 32 42Z";

export function Mark({ className, ...rest }: SvgProps) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className} {...rest}>
      <path d={MARK_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/** Wordmark lockup used in the header and footer. */
export function Lockup({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Mark className="h-7 w-7 text-red" />
      <div className="leading-none">
        <div className="font-serif text-[15px] tracking-tight">{site.name}</div>
        <div className="label mt-1 hidden whitespace-nowrap sm:block">
          {site.race.name} · {site.race.dateLabel}
        </div>
      </div>
    </div>
  );
}

/**
 * Postage stamp. Perforated edge comes from the `.stamp` mask in globals.css.
 * The event is referenced in type only; the IRONMAN M-dot is a registered mark.
 */
export function Stamp({ className = "" }: { className?: string }) {
  return (
    <div
      className={`stamp-wrap relative w-[90px] shrink-0 select-none sm:w-[110px] ${className}`}
      aria-label={`Postage stamp: ${site.race.name}`}
      role="img"
    >
      <div className="stamp flex aspect-[4/5] flex-col justify-between p-[12px] text-red">
        <div className="flex h-full flex-col justify-between border border-red p-1.5">
        <div className="flex items-start justify-between">
          <span className="label !text-red !text-[8px] !tracking-[0.12em]">
            USA
          </span>
          <span className="label !text-red !text-[8px] !tracking-[0.12em]">
            {site.race.stateAbbr}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <Mark className="h-8 w-8 sm:h-10 sm:w-10" />
          <div className="mt-1 font-serif text-[26px] leading-none tracking-tight sm:text-[30px]">
            70.3
          </div>
        </div>
        <div className="label !text-red !text-[7px] !tracking-[0.1em] text-center leading-tight sm:!text-[8px]">
          IRONMAN 70.3
          <br />
          TEXAS
        </div>
        </div>
      </div>
    </div>
  );
}

/** Circular cancellation postmark with the race date and wavy killer bars. */
export function Postmark({ className = "" }: { className?: string }) {
  const ring = "GALVESTON, TEXAS · 70.3 MILES · ";
  return (
    <svg
      viewBox="0 0 240 120"
      className={className}
      role="img"
      aria-label={`Postmarked ${site.race.city}, ${site.race.state}, ${site.race.dateLabel}`}
    >
      <defs>
        <path
          id="postmark-ring"
          d="M60 20 a40 40 0 1 1 -0.01 0"
          fill="none"
        />
      </defs>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.92"
      >
        <circle cx="60" cy="60" r="48" />
        <circle cx="60" cy="60" r="30" />
        {/* killer bars */}
        {[40, 50, 60, 70, 80].map((y) => (
          <path
            key={y}
            d={`M116 ${y} c 10 -4, 20 4, 30 0 s 20 4, 30 0 s 20 4, 30 0 s 20 4, 30 0`}
            strokeWidth="2"
          />
        ))}
      </g>
      <text
        fontFamily="var(--font-courier), monospace"
        fontSize="8.5"
        letterSpacing="1.6"
        fill="currentColor"
      >
        <textPath href="#postmark-ring" startOffset="0">
          {ring + ring}
        </textPath>
      </text>
      <g
        fill="currentColor"
        fontFamily="var(--font-courier), monospace"
        textAnchor="middle"
      >
        <text x="60" y="55" fontSize="9" letterSpacing="1">
          {site.race.postmarkDate.split(" ").slice(0, 2).join(" ")}
        </text>
        <text x="60" y="70" fontSize="11" letterSpacing="1.5">
          {site.race.postmarkDate.split(" ")[2]}
        </text>
      </g>
    </svg>
  );
}

/** Red wax seal. Rendered inside a button by the envelope. */
export function Seal({ className = "" }: { className?: string }) {
  return (
    <span
      className={`relative block h-[76px] w-[76px] rounded-full sm:h-[88px] sm:w-[88px] ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]">
        <defs>
          <radialGradient id="wax" cx="38%" cy="32%" r="75%">
            <stop offset="0" stopColor="#e63a4d" />
            <stop offset="0.55" stopColor="var(--wax)" />
            <stop offset="1" stopColor="#8f0c1b" />
          </radialGradient>
        </defs>
        {/* irregular blob so it reads as wax, not a button */}
        <path
          d="M50 4c9 0 15 4 22 8 7 4 15 9 19 17 4 8 4 16 3 24-1 8-4 16-9 23-5 7-13 12-21 15-8 3-16 3-24 1-8-2-16-6-22-12C12 74 7 66 5 58 3 50 4 42 7 34c3-8 8-15 15-20 7-5 15-9 28-10z"
          fill="url(#wax)"
        />
        <path
          d="M50 12c7 0 13 3 19 7 6 3 12 7 15 13 3 7 3 13 2 20-1 7-3 13-7 19-4 6-11 10-18 12-7 2-13 2-20 1-7-2-13-5-18-10-5-5-9-12-10-19-2-7-1-14 1-21 3-7 7-12 13-16 6-4 13-6 23-6z"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.35"
          strokeWidth="1.2"
        />
        <path transform="translate(18 17) scale(0.44)" d={MARK_PATH} fill="#fff" fillRule="evenodd" />
      </svg>
    </span>
  );
}
