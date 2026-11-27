import "server-only";
import type { CollectionReference, DocumentData, DocumentReference, Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * The only place that knows what Firestore collections are called (S5-05, STR-3). Code asks for `usersCol()`, `galleriesCol(db)` ...
 * instead of writing `collection("users")`, so a name cannot be misspelled in one of 40 files and renaming one is a one-line change.
 * Pass a `Firestore` to use one you already hold (a transaction's database, a test's); otherwise the app's Admin SDK database is used.
 * A test in tests/repos.test.ts fails if a collection name literal appears anywhere outside `lib/server/repos/` and `scripts/`.
 */
export const COLLECTIONS = {
  users: "users",
  galleries: "galleries",
  payments: "payments",
  plans: "plans",
  promoCodes: "promoCodes",
  demoGalleries: "demo_galleries",
  gallerySelections: "gallery_selections",
  galleryStats: "gallery_stats",
  contactMessages: "contactMessages",
  stripeEvents: "stripe_events",
  customerNotices: "customer_notices",
  auditLog: "audit_log",
  /** Legacy: one document per favourite, no longer written. */
  favorites: "favorites",
} as const;

const col =
  (name: string) =>
  (db: Firestore = getAdminDb()): CollectionReference<DocumentData> =>
    db.collection(name);

export const usersCol = col(COLLECTIONS.users);
export const galleriesCol = col(COLLECTIONS.galleries);
export const paymentsCol = col(COLLECTIONS.payments);
export const plansCol = col(COLLECTIONS.plans);
export const promoCodesCol = col(COLLECTIONS.promoCodes);
export const demoGalleriesCol = col(COLLECTIONS.demoGalleries);
export const gallerySelectionsCol = col(COLLECTIONS.gallerySelections);
export const galleryStatsCol = col(COLLECTIONS.galleryStats);
export const contactMessagesCol = col(COLLECTIONS.contactMessages);
export const stripeEventsCol = col(COLLECTIONS.stripeEvents);
export const customerNoticesCol = col(COLLECTIONS.customerNotices);
export const auditLogCol = col(COLLECTIONS.auditLog);
export const favoritesCol = col(COLLECTIONS.favorites);

/** Small bookkeeping documents for scheduled jobs (when the digest last went out, how far reconciliation got). */
export const systemStateDoc = (name: string, db: Firestore = getAdminDb()): DocumentReference<DocumentData> => db.collection("system_state").doc(name);

/** The single site-settings document (support e-mail, tracking ids). */
export const SITE_SETTINGS_PATH = "settings/site";
export const siteSettingsDoc = (db: Firestore = getAdminDb()): DocumentReference<DocumentData> => db.doc(SITE_SETTINGS_PATH);
