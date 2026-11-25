/** Read at call time so tests (and a redeploy-free env change) take effect immediately. */
export function billingFulfilV2(): boolean {
  const v = process.env.BILLING_FULFIL_V2;
  return v === "1" || v === "true";
}

/** Which deployment this is, stamped on Stripe metadata so test/live data can be told apart. */
export function appEnv(): string {
  if (process.env.APP_ENV) return process.env.APP_ENV;
  // Vercel sets NODE_ENV=production on previews too, so look at VERCEL_ENV first.
  if (process.env.VERCEL_ENV === "preview") return "staging";
  if (process.env.VERCEL_ENV === "development") return "local";
  return process.env.NODE_ENV === "production" ? "production" : "local";
}
