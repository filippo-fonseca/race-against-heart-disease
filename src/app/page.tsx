import { Envelope } from "@/components/Envelope";
import { Lockup } from "@/components/marks";
import { site } from "@/lib/site";

export default function Home() {
  return (
    <>
      <header className="flex h-[72px] items-center justify-between px-5 sm:px-8">
        <Lockup />
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
