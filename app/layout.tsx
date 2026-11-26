import type { Metadata } from "next";
import Script from "next/script";
import "./fonts.css";
import "./globals.css";
import { ClientProviders } from "@/components/ClientProviders";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import { APP_NAME, APP_URL } from "@/lib/branding";
import { getTrackingIds } from "@/lib/tracking-settings";
import { getLanguage } from "@/lib/i18n/server";
import { PAGE_TITLES } from "@/lib/i18n/languages";

// Fonts are self-hosted (app/fonts.css + app/fonts/*.woff2): nothing is fetched from Google at build or run time.

const description =
  "Share professional galleries with your clients straight from Google Drive.";

// The tab title and link preview follow the visitor's language (S5-06); the description stays English.
export async function generateMetadata(): Promise<Metadata> {
  const { lang } = await getLanguage();
  const title = PAGE_TITLES[lang].replace(/^PhotoDrive/, APP_NAME);
  return {
    metadataBase: new URL(APP_URL),
    title,
    description,
    openGraph: { type: "website", siteName: APP_NAME, title, description, url: APP_URL },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Tag IDs are managed in Dashboard → Admin → Settings (validated server-side,
  // so they're safe to interpolate into the snippets below).
  const { gtmId, googleAdsId, metaPixelId } = await getTrackingIds();
  // The language of this request (cookie, else the browser's preference): the page is rendered in it from the first byte.
  const { lang, dictionary } = await getLanguage();

  return (
    <html
      lang={lang}
      className="h-full antialiased"
    >
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) inject
          attributes like cz-shortcut-listen="true" onto <body> before React
          hydrates, causing a spurious hydration mismatch. This is the React-
          recommended fix for third-party DOM mutations on this element. */}
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-canvas text-fg" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
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
        <ClientProviders lang={lang} dictionary={dictionary}>{children}</ClientProviders>
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
