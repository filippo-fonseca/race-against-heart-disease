import Link from "next/link";
import { Mark } from "./marks";
import { SocialIcon } from "./Socials";
import { site } from "@/lib/site";

/** "admin" renders the bar with no active tab. */
type Current = "letter" | "training" | "admin";

/** Floating, rounded, translucent bar shared by every page. Sticks a little below the top edge. */
export function SiteHeader({ current }: { current: Current }) {
  const tab = (active: boolean) =>
    `label whitespace-nowrap !tracking-[0.06em] transition-colors ${
      active ? "!text-ink" : "!text-ink-faint hover:!text-ink"
    }`;

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="mx-auto flex h-14 max-w-[960px] items-center justify-between rounded-2xl bg-paper/80 pl-3 pr-2.5 shadow-[var(--shadow-surface)] backdrop-blur-xl sm:pl-4 sm:pr-3">
        <Link href="/" className="flex items-center gap-2.5" aria-label={site.name}>
          <Mark className="beat h-8 w-8 text-red" />
          <span className="hidden font-serif text-[16px] font-bold tracking-tight sm:inline">{site.name}</span>
        </Link>

        <nav className="flex items-center gap-5 sm:gap-7" aria-label="Site">
          <Link href="/" className={tab(current === "letter")} aria-current={current === "letter" ? "page" : undefined}>
            <span className="sm:hidden">Letter</span>
            <span className="hidden sm:inline">The letter</span>
          </Link>
          <Link
            href="/training"
            className={tab(current === "training")}
            aria-current={current === "training" ? "page" : undefined}
          >
            <span className="sm:hidden">Training</span>
            <span className="hidden sm:inline">The training</span>
          </Link>
          <a
            href={site.repo}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Source code on GitHub"
            title="Source code on GitHub"
            className="text-ink-faint transition-colors hover:text-ink"
          >
            <SocialIcon kind="github" className="h-5 w-5" />
          </a>
          <a
            href={site.donateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pill pill-red !h-8 !px-3.5 !text-[14px]"
          >
            Donate
          </a>
        </nav>
      </div>
    </header>
  );
}
