import Link from "next/link";
import { Mark } from "./marks";
import { site } from "@/lib/site";

/** "admin" renders the bar with no active tab. */
type Current = "letter" | "training" | "admin";

/** Sticky, translucent top bar shared by every page. */
export function SiteHeader({ current }: { current: Current }) {
  const tab = (active: boolean) =>
    `label whitespace-nowrap !tracking-[0.06em] transition-colors ${
      active ? "!text-ink" : "!text-ink-faint hover:!text-ink"
    }`;

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-desk/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label={site.name}>
          <Mark className="h-6 w-6 text-red" knockout={false} />
          <span className="hidden font-serif text-[15px] tracking-tight sm:inline">{site.name}</span>
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
