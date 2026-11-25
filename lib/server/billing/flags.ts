/** Read at call time so tests (and a redeploy-free env change) take effect immediately. */
export function billingFulfilV2(): boolean {
  const v = process.env.BILLING_FULFIL_V2;
  return v === "1" || v === "true";
}

/** Which deployment this is, stamped on Stripe metadata so test/live data can be told apart. */
export function appEnv(): string {
  return process.env.APP_ENV || (process.env.NODE_ENV === "production" ? "production" : "local");
}
