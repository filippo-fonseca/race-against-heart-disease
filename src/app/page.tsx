import { Envelope } from "@/components/Envelope";
import { Letter } from "@/components/Letter";
import { SiteHeader } from "@/components/SiteHeader";

export default function Home() {
  return (
    <>
      <SiteHeader current="letter" />
      <main className="flex-1">
        <Envelope letter={<Letter />} />
      </main>
    </>
  );
}
