import type { Metadata } from "next";
import Script from "next/script";
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

const GTM_ID = "GTM-5789H3DW";

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
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="gtm"
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}
        <ClientProviders>{children}</ClientProviders>
        <SiteAnalytics />
        {/* Google Tag Manager */}
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `}
        </Script>
        {/* End Google Tag Manager */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=AW-18467164685"
          strategy="afterInteractive"
        />
        <Script id="google-ads-tag" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-18467164685');
          `}
        </Script>
      </body>
    </html>
  );
}
