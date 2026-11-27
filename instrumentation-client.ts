import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/shared/monitoring";

// Error monitoring in the browser (S0-06). Inert without NEXT_PUBLIC_SENTRY_DSN. No session replay, no user identity; events pass the
// same privacy filter as the server's. The CSP already allows https://*.ingest.sentry.io.
const options = sentryOptions(
  {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    NODE_ENV: process.env.NODE_ENV,
  },
  "browser",
);
if (options) Sentry.init(options);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
