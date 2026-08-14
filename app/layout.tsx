import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "@/components/ClientProviders";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import { APP_NAME, APP_URL } from "@/lib/branding";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin", "greek"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
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
    <html lang="en" className={`${ibmPlexSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
        <ClientProviders>{children}</ClientProviders>
        <SiteAnalytics />
      </body>
    </html>
  );
}
