import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/shared/monitoring";

// Error monitoring for the edge runtime (S0-06). Inert without SENTRY_DSN.
const options = sentryOptions(process.env, "server");
if (options) Sentry.init(options);
