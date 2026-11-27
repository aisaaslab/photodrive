import "server-only";
import * as Sentry from "@sentry/nextjs";

/**
 * Reports an error the code has already handled (logged and answered) so it is not lost: API error paths, webhooks, cron jobs (S0-06).
 * Does nothing unless monitoring is switched on (a DSN is set), never throws, and sends only the error and a few labels: the privacy
 * filter in `lib/shared/monitoring.ts` runs on every event.
 */
export function captureServerError(err: unknown, context: { scope: string; requestId?: string; [k: string]: string | number | boolean | undefined }): void {
  try {
    if (!Sentry.getClient()) return;
    const { scope, requestId, ...tags } = context;
    Sentry.withScope((s) => {
      s.setTag("scope", scope);
      if (requestId) s.setTag("request_id", requestId);
      for (const [k, v] of Object.entries(tags)) if (v !== undefined) s.setTag(k, String(v));
      Sentry.captureException(err instanceof Error ? err : new Error(typeof err === "string" ? err : "non-error thrown"));
    });
  } catch {
    // monitoring must never break the request
  }
}
