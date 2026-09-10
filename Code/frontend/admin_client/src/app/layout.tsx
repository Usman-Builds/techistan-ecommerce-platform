import type { Metadata } from "next";
// Fonts are driven by src/theme/brand.ts (`fonts.heading` / `fonts.body`).
// next/font requires a STATIC import per family, so the two families the brand
// currently uses are imported here and exposed as CSS vars --font-heading /
// --font-body (consumed by globals.css). To swap typography, edit brand.fonts;
// introducing a brand-NEW family is the one case that also needs the matching
// one-line import change below.
import { Geist, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const fontHeading = Geist({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const fontBody = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Techistan Admin",
  description: "Techistan admin panel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontHeading.variable} ${fontBody.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
