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
import { Header } from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/Footer";
import { getSettingsServer } from "@/lib/api/settings";
import { SITE_URL } from "@/lib/seo/site";
import {
  JsonLd,
  organizationJsonLd,
  websiteJsonLd,
} from "@/lib/seo/jsonLd";

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

// Baseline metadata for every route (script 17). `metadataBase` makes relative
// canonical/OG URLs resolve absolutely; the title template wraps child titles as
// "Page | Store". Store name/description come from live StoreSetting so editing
// the store re-titles the whole site.
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettingsServer();
  const name = settings.name;
  const description = `Shop ${name} — discover featured products, browse by category, and check out securely.`;

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: name, template: `%s | ${name}` },
    description,
    applicationName: name,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: name,
      title: name,
      description,
      url: SITE_URL,
    },
    twitter: { card: "summary_large_image", title: name, description },
    robots: { index: true, follow: true },
    // Icons come from the app/ file conventions (favicon.ico, icon.svg,
    // apple-icon.png), which emit their own <link> tags.
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getSettingsServer();

  return (
    <html
      lang="en"
      className={`${fontHeading.variable} ${fontBody.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Site-wide structured data (script 17, NFR-703). */}
        <JsonLd data={organizationJsonLd(settings)} />
        <JsonLd data={websiteJsonLd(settings)} />
        <Providers>
          <a
            href="#content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
          >
            Skip to content
          </a>
          <Header />
          <main id="content" className="flex-1">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
