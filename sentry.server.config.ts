import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/shared/monitoring";

// Error monitoring for the Node server (S0-06). Inert without SENTRY_DSN: nothing is initialised.
const options = sentryOptions(process.env, "server");
if (options) Sentry.init(options);
