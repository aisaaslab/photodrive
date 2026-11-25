export interface GalleryDoc {
  id: string;
  photographerId: string;
  name: string;
  slug: string;
  folderId: string;
  passwordHash?: string;
  password?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  // When false, download buttons are hidden in the gallery (e.g. show photos
  // for album selection before the client has paid). Defaults to true.
  allowDownload?: boolean;
  // Optional subtitle shown under the gallery name on the public page.
  description?: string;
  // Optional event date as "YYYY-MM-DD"; rendered locale-aware on the gallery.
  eventDate?: string;
  // Optional event location (e.g. "Santorini, Greece").
  location?: string;
  // Optional Drive file id of a photo chosen by the photographer as the
  // gallery's cover/hero image. null/undefined => gradient fallback.
  coverFileId?: string | null;
  // Focal point of the cover, in percent (0–100) on each axis, applied as CSS
  // object-position so the photographer chooses which part of the photo stays
  // visible in the banner crop. Unset => centered (50 / 50).
  coverPosX?: number | null;
  coverPosY?: number | null;
  // "Book this photographer" CTA: a URL the client can click to contact the
  // photographer (mailto:, https://wa.me/, https://m.me/, any URL). When
  // bookEnabled is false (or bookLink is empty), the CTA is hidden.
  bookLink?: string;
  bookEnabled?: boolean;
  // Gallery title styling, picked by the photographer from a curated set.
  // titleFont: one of TITLE_FONT_IDS in lib/gallery/title-style.ts ("classic"
  // when unset). titleColor: a 6-digit hex (white when unset). titleSize: one
  // of TITLE_SIZE_IDS ("md", the default look, when unset).
  titleFont?: string | null;
  titleColor?: string | null;
  titleSize?: string | null;
  // Read-only summary of the client's favorites, attached by GET /api/galleries
  // from the gallery_selections collection (not stored on the gallery itself).
  selectionCount?: number;
  selectionUpdatedAt?: number;
  // When the client last pressed "Send selection" (see gallery_selections).
  selectionSubmittedAt?: number;
  // Show the photographer's avatar + name in the public gallery header instead
  // of the PhotoDrive logo. null/undefined => PhotoDrive logo.
  headerBranding?: "photographer" | null;
  createdAt: number;
  updatedAt: number;
}

export interface UserDoc {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  createdAt: number;
  subscriptionStatus?: "active" | "expired" | "none";
  subscriptionExpiresAt?: number;
  stripeCustomerId?: string;
  // Snapshot of the plan currently assigned/purchased (kept even if the plan
  // document is later deleted, so history still renders).
  planId?: string;
  planName?: string;
  planInterval?: PlanInterval;
}

/** Billing period of a payment plan. */
export type PlanInterval = "monthly" | "yearly";

/**
 * A payment plan managed in the admin back office.
 *
 * - `isPublic` plans are listed on the landing-page pricing section and the
 *   subscribe page; private plans are only reachable via their direct
 *   /subscribe?plan={id} link or by admin assignment.
 * - `active` plans can be purchased / assigned; inactive ones are kept for
 *   reference only.
 * - `highlight` draws attention to the card on the pricing grid.
 */
export interface PlanDoc {
  id: string;
  name: string;
  description?: string;
  interval: PlanInterval;
  priceCents: number;
  currency: string;
  features: string[];
  isPublic: boolean;
  active: boolean;
  highlight?: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface FavoriteDoc {
  galleryId: string;
  photoId: string;
  sessionId: string;
  createdAt: number;
}

/** Where a fulfilment was triggered from. */
export type FulfilSource = "webhook" | "verify" | "reconcile" | "admin" | "backfill";

/**
 * `payments/{checkoutSessionId}`. Its existence is the idempotency key for
 * fulfilment. Documents written before S1-03 have none of the optional fields
 * and no `status`; they count as fulfilled.
 */
export interface PaymentDoc {
  uid: string;
  sessionId: string;
  amountTotal: number | null;
  currency: string | null;
  customerId: string | null;
  planId: string | null;
  interval: PlanInterval | null;
  source: "paid" | "free_code";
  promoCode?: string;
  accessDays?: number;
  accessDaysSource?: "back_office" | "stripe";
  activatedAt: number;
  // Added by fulfilCheckoutSession (S1-03)
  status?: "fulfilled" | "refunded" | "partially_refunded" | "disputed";
  grantedMs?: number;
  expiresAtAfter?: number;
  paymentIntentId?: string | null;
  fulfilledBy?: FulfilSource;
  livemode?: boolean | null;
}

export type StripeEventStatus = "processing" | "processed" | "ignored" | "needs_review" | "failed";

/** `stripe_events/{eventId}`: one document per Stripe event we have received (S2-01). */
export interface StripeEventDoc {
  type: string;
  livemode: boolean;
  receivedAt: number;
  /** Set when a delivery last started processing; used to detect a crashed attempt. */
  lastAttemptAt: number;
  attempts: number;
  status: StripeEventStatus;
  processedAt?: number;
  sessionId?: string;
  uid?: string;
  outcome?: string;
  error?: string;
}
