import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { sentryDsn, sentryRelease } from "./lib/shared/monitoring";

/**
 * Content-Security-Policy, REPORT-ONLY for now (S3-08): the browser reports what it would block to /api/csp-report but blocks
 * nothing, so the allowlist can be checked against real traffic before it is enforced (R2 gate: three days without violations).
 *
 * Built from what the app actually loads: Google Tag Manager / gtag / Meta Pixel (inline snippets, hence 'unsafe-inline' for
 * scripts; a nonce would force every page to render dynamically), Firebase Auth (Google sign-in popup), Google's image CDN and
 * Drive for gallery photos, Drive's video preview in an iframe, Vercel Analytics, Stripe (checkout is a redirect). Fonts are
 * self-hosted. Scripts may not use eval.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://connect.facebook.net https://apis.google.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://drive.google.com https://*.gstatic.com https://www.google.com https://www.googletagmanager.com https://*.google-analytics.com https://googleads.g.doubleclick.net https://www.facebook.com",
  "media-src 'self' blob: https://*.googleusercontent.com https://drive.usercontent.google.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.doubleclick.net https://www.facebook.com https://connect.facebook.net https://vitals.vercel-insights.com https://va.vercel-scripts.com https://*.googleusercontent.com https://drive.usercontent.google.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
  "frame-src https://drive.google.com https://accounts.google.com https://*.firebaseapp.com https://www.googletagmanager.com https://td.doubleclick.net https://www.facebook.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'self'",
  "report-uri /api/csp-report",
  "report-to csp",
].join("; ");

const nextConfig: NextConfig = {
  // Do not advertise the framework in every response.
  poweredByHeader: false,

  async headers() {
    const production = process.env.NODE_ENV === "production";
    return [
      {
        // Every route, API included.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing here uses the camera, microphone, location or the Payment Request API (checkout is a redirect to Stripe).
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          // Clickjacking: only our own pages may frame our pages. Enforced (this directive is ignored in report-only mode),
          // with X-Frame-Options for old browsers. Google sign-in is a popup, not a frame, so it is unaffected.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      // The full policy, report-only, on pages (not API responses), in production only: the dev server needs eval.
      ...(production
        ? [
            {
              source: "/((?!api/).*)",
              headers: [
                { key: "Content-Security-Policy-Report-Only", value: csp },
                { key: "Reporting-Endpoints", value: 'csp="/api/csp-report"' },
              ],
            },
          ]
        : []),
    ];
  },

  images: {
    // Serve next/image sources as-is (no Vercel Image Optimization billing).
    // Our gallery photos use plain <img> from Google's CDN anyway; the few
    // next/image usages are tiny static/brand images.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

/**
 * Error monitoring (S0-06). The wrapper is applied ONLY when a DSN is configured, so without one the build and the app are exactly as
 * before. With a DSN it tags the release (the commit) and, when SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are set, uploads source
 * maps at build time and deletes them from the output, so stack traces are readable in Sentry and the maps are never public.
 */
const monitoring = sentryDsn(process.env, "server") || sentryDsn(process.env, "browser");
export default monitoring
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: sentryRelease(process.env) },
      silent: !process.env.CI,
      telemetry: false,
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
      widenClientFileUpload: true,
      // Events go straight to Sentry (the CSP already allows *.ingest.sentry.io); no tunnel route is added.
    })
  : nextConfig;
