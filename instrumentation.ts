import * as Sentry from "@sentry/nextjs";

/**
 * Next.js calls register() once per server instance (S0-06). Error monitoring is loaded for the runtime in use; both setups do nothing
 * unless a DSN is configured. `onRequestError` hands Sentry every error Next.js catches in a route, page or server component.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

export const onRequestError = Sentry.captureRequestError;
