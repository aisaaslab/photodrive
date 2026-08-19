import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { Playfair_Display, Dancing_Script, Poppins, Space_Mono } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "@/components/ClientProviders";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import { APP_NAME, APP_URL } from "@/lib/branding";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin", "greek"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

// Gallery title fonts the photographer can pick (see lib/gallery/title-style.ts).
// Self-hosted at build time; a woff2 file is only downloaded when a page
// actually renders text in that family, so unused fonts cost ~nothing.
const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-title-serif",
  display: "swap",
});
const dancingScript = Dancing_Script({
  subsets: ["latin"],
  variable: "--font-title-script",
  display: "swap",
});
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-title-modern",
  display: "swap",
});
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-title-mono",
  display: "swap",
});

const description =
  "Share professional galleries with your clients straight from Google Drive.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: `${APP_NAME}, Professional galleries for photographers`,
  description,
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: `${APP_NAME}, Professional galleries for photographers`,
    description,
    url: APP_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME}, Professional galleries for photographers`,
    description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${playfairDisplay.variable} ${dancingScript.variable} ${poppins.variable} ${spaceMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) inject
          attributes like cz-shortcut-listen="true" onto <body> before React
          hydrates, causing a spurious hydration mismatch. This is the React-
          recommended fix for third-party DOM mutations on this element. */}
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-stone-50 text-stone-900" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
        <ClientProviders>{children}</ClientProviders>
        <SiteAnalytics />
      </body>
    </html>
  );
}
