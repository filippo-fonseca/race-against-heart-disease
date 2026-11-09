import { Letter } from "@/components/Letter";
import { SiteHeader } from "@/components/SiteHeader";

export default function Home() {
  return (
    <>
      <SiteHeader current="letter" />
      <main className="flex-1">
        <div className="px-4 py-6 sm:px-6 sm:py-10">
          <Letter />
        </div>
      </main>
    </>
  );
}
