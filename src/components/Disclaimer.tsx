import { site } from "@/lib/site";

/**
 * Footer note on where donations go: to the IRONMAN Foundation through Team
 * IMF, not straight to heart disease research, and why that still serves
 * prevention. Shown in the footer of the letter and the training log.
 */
export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <aside
      aria-labelledby="where-the-money-goes"
      className={`mx-auto max-w-[640px] rounded-2xl bg-desk/70 px-5 py-4 text-left shadow-[0_0_0_1px_var(--rule)] sm:px-6 ${className}`}
    >
      <h2 id="where-the-money-goes" className="label !text-ink">
        Where the money goes
      </h2>
      <div className="mt-2 space-y-2 text-justify font-serif text-[0.98rem] leading-relaxed text-ink-soft hyphens-auto">
        <p>
          I am raising money for{" "}
          <a
            href={site.charity.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-rule underline-offset-4 hover:text-red"
          >
            {site.charity.name}
          </a>{" "}
          through {site.charity.team}, not directly for heart disease research. My theory is that the
          Foundation&apos;s work will keep more and more children from falling into dangerous patterns of
          inactivity, and from growing up without knowing how to exercise or build healthy habits, both of
          which leave them more susceptible to heart disease.
        </p>
        <p>
          I am also betting that by advocating for heart disease prevention through healthy habits and
          taking on hard challenges, I can spread that message far and wide to everyone involved as the
          amount we raise for {site.charity.team} grows.
        </p>
      </div>
    </aside>
  );
}
