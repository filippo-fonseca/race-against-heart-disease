import { Envelope } from "@/components/Envelope";
import { Mark } from "@/components/marks";
import { site } from "@/lib/site";

export default function Home() {
  return (
    <>
      <header className="flex h-[64px] items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <Mark className="h-6 w-6 text-red" knockout={false} />
          <span className="label !text-ink">{site.name}</span>
        </div>
        <a
          href={site.donateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="label !text-red underline decoration-red/30 underline-offset-4 hover:decoration-red"
        >
          Donate
        </a>
      </header>
      <main className="flex-1">
        <Envelope />
      </main>
    </>
  );
}
