export interface GalleryDoc {
  id: string;
  photographerId: string;
  name: string;
  slug: string;
  folderId: string;
  passwordHash?: string | null;
  /** Legacy plaintext copy; cleared by scripts/migrations/seal-legacy-passwords.ts (S4-04). Owners see the decrypted value here. */
  password?: string | null;
  /** The password sealed for the owner's reminder (AES-256-GCM, lib/gallery/password-vault.ts). Never sent to a browser. */
  passwordEnc?: string | null;
  /** When the password last changed; unlock cookies issued before it stop working. */
  pwChangedAt?: number;
  // Public (no password) or private (password required), decision D18. Galleries created before this
  // existed have none: derive it with galleryVisibility() (lib/gallery/visibility.ts).
  visibility?: "public" | "private";
  website?: string;
  instagram?: string;
  facebook?: string;
  // When false, download buttons are hidden in the gallery (e.g. show photos
  // for album selection before the client has paid). Defaults to true.
  allowDownload?: boolean;
  // S9-06: "switch off downloads once a selection is sent". `downloadsLockedAt` is stamped when a selection is submitted while the
  // option is on; see lib/gallery/downloads.ts. Turning the option off or on again clears the stamp.
  disableDownloadAfterSubmit?: boolean;
  downloadsLockedAt?: number | null;
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
  // S9-05: optional end of the gallery's life, as a time (the end of the chosen day, UTC). Visitors see the "unavailable" page after it;
  // the owner can change or clear it at any time. See lib/gallery/availability.ts.
  expiresAt?: number | null;
  // Attached by GET /api/galleries (never stored): is it shown to visitors, in grace after the owner's plan ended, or offline?
  availability?: import("@/lib/gallery/availability").Availability;
  // Usage counts (S10-02), attached by GET /api/galleries from gallery_stats; absent until someone opens the gallery.
  stats?: import("@/lib/gallery/stats").StatsSummary;
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
  /** Set once, at sign-up (S4-01). A Firestore Timestamp when the browser created the profile, a number when an admin did. */
  createdAt: number | { toMillis(): number };
  subscriptionStatus?: "active" | "expired" | "none";
  subscriptionExpiresAt?: number;
  /** Granted by an administrator rather than bought. */
  compGranted?: boolean;
  /** How access was obtained. */
  subscriptionSource?: "paid" | "free_code";
  promoCode?: string;
  /** Which renewal reminders were e-mailed, by kind, with the time sent. */
  remindersSent?: Record<string, number>;
  stripeCustomerId?: string;
  // Snapshot of the plan currently assigned/purchased (kept even if the plan
  // document is later deleted, so history still renders).
  planId?: string;
  planName?: string;
  planInterval?: PlanInterval;
  // Preferred language (one of the six app languages), stored by PUT /api/user/language so the server can write
  // to the user in it (S2-13). Server-written only (firestore.rules); read it with userLanguage().
  language?: "el" | "en" | "nl" | "de" | "es" | "it";
  languageUpdatedAt?: number;
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
  /** The Stripe invoice created by checkout (S4-06), when there is one. Older payments have none. */
  invoiceId?: string;
  planId: string | null;
  interval: PlanInterval | null;
  source: "paid" | "free_code";
  promoCode?: string;
  accessDays?: number;
  accessDaysSource?: "back_office" | "stripe";
  activatedAt: number;
  // Added by fulfilCheckoutSession (S1-03)
  status?: PaymentStatus;
  grantedMs?: number;
  expiresAtAfter?: number;
  paymentIntentId?: string | null;
  fulfilledBy?: FulfilSource;
  livemode?: boolean | null;
  // Added by refund / dispute handling (S2-02)
  chargeId?: string | null;
  refundedAmount?: number;
  /** Access time actually taken back when the grant was revoked (so a won dispute can give it back). */
  revokedMs?: number;
  revokedAt?: number;
  disputeId?: string;
  /** An operator should look at this payment (partial refund, open dispute, legacy payment revoked). */
  needsReview?: boolean;
  reviewNote?: string;
}

/**
 * fulfilled / partially_refunded: the grant is in effect.
 * refunded / disputed / dispute_lost: the grant has been taken back (disputed may be restored if won).
 */
export type PaymentStatus = "fulfilled" | "refunded" | "partially_refunded" | "disputed" | "dispute_lost";

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
  /** When the operator alert for this event was sent (so it is sent once). */
  alertedAt?: number;
}
