/** The section id the "About me" link jumps to (the postcards section of the letter). */
export const ABOUT_ID = "about";

/** "About me" pill next to the author's name; jumps down to the about section. */
export function AboutLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={`#${ABOUT_ID}`}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full bg-paper px-3.5 text-[0.85rem] font-semibold text-ink shadow-[0_0_0_1px_var(--rule),0_1px_2px_rgba(20,20,20,0.06)] transition-[background-color,transform] hover:bg-desk active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red ${className}`}
    >
      About me
      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
        <path d="M6 2.5v7M2.5 6 6 9.5 9.5 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
