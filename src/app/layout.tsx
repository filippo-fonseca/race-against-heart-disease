import type { Metadata } from "next";
import { Caveat, EB_Garamond, Geist_Mono } from "next/font/google";
import { site } from "@/lib/site";
import "./globals.css";

const garamond = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const description = `${site.author.name} is racing ${site.race.name} on ${site.race.dateLabel} for ${site.charity.team}, to make one argument out loud: hearts are built to be pushed. Every dollar goes to ${site.charity.name}.`;

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
      className={`${garamond.variable} ${geistMono.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
