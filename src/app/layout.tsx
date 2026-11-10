import type { Metadata } from "next";
import { Caveat, Courier_Prime, EB_Garamond } from "next/font/google";
import { DotField } from "@/components/DotField";
import { site } from "@/lib/site";
import "./globals.css";

const garamond = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const courier = Courier_Prime({
  variable: "--font-courier",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const description = `${site.author.name} is racing ${site.race.name} on ${site.race.dateLabel} with ${site.charity.team} to raise awareness that the habits which prevent coronary heart disease begin in childhood. Every dollar donated goes to ${site.charity.name}.`;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.name,
    template: `%s · ${site.name}`,
  },
  description,
  openGraph: {
    title: site.name,
    description,
    siteName: site.name,
    type: "website",
    url: site.url,
  },
  twitter: {
    card: "summary_large_image",
    title: site.name,
    description,
  },
  authors: [{ name: site.author.name, url: site.author.url }],
  keywords: [
    "heart disease",
    "cardiovascular health",
    "endurance",
    "IRONMAN 70.3 Texas",
    "Team IMF",
    "IRONMAN Foundation",
    "sedentary lifestyle",
    "youth physical activity",
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${garamond.variable} ${courier.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="desk min-h-full flex flex-col">
        <DotField />
        {children}
      </body>
    </html>
  );
}
