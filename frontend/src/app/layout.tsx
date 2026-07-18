import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { CartDrawer } from "@/components/CartDrawer";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { RewardsTicker } from "@/components/RewardsTicker";
import { Footer } from "@/components/Footer";
import { jsonLd } from "@/lib/seo";
import { StorefrontOnly } from "@/components/StorefrontOnly";
import {
  absoluteSiteUrl,
  DEFAULT_SHARE_IMAGE,
  getSiteUrl,
  SITE_DESCRIPTION,
  SITE_NAME,
} from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: `${SITE_NAME} · Gym gear, supplements, apparel`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "fitness and sporting goods",
  keywords: [
    "gym supplements",
    "home gym equipment",
    "training apparel",
    "fitness accessories",
  ],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: SITE_NAME,
    title: `${SITE_NAME} · Built for the next session`,
    description: SITE_DESCRIPTION,
    url: "/",
    images: [
      {
        url: DEFAULT_SHARE_IMAGE,
        width: 1200,
        height: 630,
        alt: "Athlete training in a gym",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} · Built for the next session`,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_SHARE_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4c430",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-IN">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": `${absoluteSiteUrl("/")}#organization`,
                  name: SITE_NAME,
                  url: absoluteSiteUrl("/"),
                },
                {
                  "@type": "WebSite",
                  "@id": `${absoluteSiteUrl("/")}#website`,
                  name: SITE_NAME,
                  url: absoluteSiteUrl("/"),
                  potentialAction: {
                    "@type": "SearchAction",
                    target: `${absoluteSiteUrl("/shop")}?q={search_term_string}`,
                    "query-input": "required name=search_term_string",
                  },
                },
              ],
            }),
          }}
        />
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
      </head>
      <body className="antialiased">
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-lg transition-transform focus:translate-y-0"
        >
          Skip to main content
        </a>
        <Providers>
          <StorefrontOnly>
            <AnnouncementBar />
            <RewardsTicker />
            <Suspense fallback={null}>
              <Header />
            </Suspense>
          </StorefrontOnly>
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
          <StorefrontOnly>
            <Footer />
            <CartDrawer />
          </StorefrontOnly>
        </Providers>
      </body>
    </html>
  );
}
