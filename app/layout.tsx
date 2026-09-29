import type { Metadata } from "next";
import Script from "next/script";
import { IBM_Plex_Sans } from "next/font/google";
import { Playfair_Display, Dancing_Script, Poppins, Space_Mono } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "@/components/ClientProviders";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import { APP_NAME, APP_URL } from "@/lib/branding";
import { getTrackingIds } from "@/lib/tracking-settings";

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Tag IDs are managed in Dashboard → Admin → Settings (validated server-side,
  // so they're safe to interpolate into the snippets below).
  const { gtmId, googleAdsId, metaPixelId } = await getTrackingIds();

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
        {gtmId && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="gtm"
            />
          </noscript>
        )}
        <ClientProviders>{children}</ClientProviders>
        <SiteAnalytics />
        {gtmId && (
          <Script id="google-tag-manager" strategy="afterInteractive">
            {`
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${gtmId}');
            `}
          </Script>
        )}
        {googleAdsId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${googleAdsId}`}
              strategy="afterInteractive"
            />
            <Script id="google-ads-tag" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${googleAdsId}');
              `}
            </Script>
          </>
        )}
        {metaPixelId && (
          <>
            <Script id="meta-pixel" strategy="afterInteractive">
              {`
                !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
                n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
                t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
                document,'script','https://connect.facebook.net/en_US/fbevents.js');
                fbq('init', '${metaPixelId}');
                fbq('track', 'PageView');
              `}
            </Script>
            <noscript>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                height="1"
                width="1"
                style={{ display: "none" }}
                alt=""
                src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
              />
            </noscript>
          </>
        )}
      </body>
    </html>
  );
}
