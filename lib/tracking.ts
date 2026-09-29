"use client";

export type PurchaseInfo = {
  transactionId: string;
  value: number;
  currency: string;
};

type Fbq = (...args: unknown[]) => void;
type TrackingWindow = Window & { fbq?: Fbq; dataLayer?: unknown[] };

// The pixel is injected after hydration, so it may not exist yet when the
// Thank You page mounts. Wait for it briefly rather than dropping the event.
function whenFbqReady(cb: (fbq: Fbq) => void, tries = 40) {
  const w = window as TrackingWindow;
  if (typeof w.fbq === "function") return cb(w.fbq);
  if (tries <= 0) return;
  setTimeout(() => whenFbqReady(cb, tries - 1), 250);
}

/**
 * Fires the purchase conversion exactly once per Checkout Session (a refresh
 * or revisit of the Thank You URL does not double-count):
 *  - Meta Pixel `Purchase` with value + currency; eventID = session id, so a
 *    later server-side Conversions API event can be deduplicated against it.
 *  - a GA4-style `purchase` dataLayer event for GTM / Google Ads.
 */
export function trackPurchase(p: PurchaseInfo) {
  const key = `purchase-tracked:${p.transactionId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // Storage blocked — fall through; worst case a refresh re-fires.
  }

  const w = window as TrackingWindow;
  (w.dataLayer = w.dataLayer || []).push({
    event: "purchase",
    ecommerce: { transaction_id: p.transactionId, value: p.value, currency: p.currency },
  });

  whenFbqReady((fbq) =>
    fbq("track", "Purchase", { value: p.value, currency: p.currency }, { eventID: p.transactionId })
  );
}
