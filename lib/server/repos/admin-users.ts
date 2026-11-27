import "server-only";
import { FieldPath, type DocumentData, type Firestore, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { accessSourceOf, latestPaymentByUid, paymentFlagsByUid, type AccessSource, type PaymentFlag } from "@/lib/access-source";
import { toMs } from "@/lib/server/migrations/restore-created-at";
import { auditLogCol, galleriesCol, paymentsCol, usersCol } from "./collections";

/**
 * The admin Users list and detail (S7-05, SEC-5). The old endpoint listed up to 1,000 Auth accounts and read every gallery and payment
 * to build one huge answer. Now a page is one indexed Firestore query, and only the people on that page cost anything extra: one Auth
 * lookup for the page, a gallery count and a newest-gallery read per person, and one payment query for the page.
 *
 * Ordering and filters (each is one indexed query; see firestore.indexes.json):
 *   all / comped -> by `emailLower` (alphabetical; also what a search runs on, as a prefix range)
 *   active / expiring -> by access end, soonest first (status "active", end in the future; expiring = within 30 days, never lifetime)
 *   lapsed -> by access end, most recent first (had access, it ran out)
 * A search (`q`) always runs on `emailLower`; a filter chosen at the same time is applied to the matches.
 */
export type UserFilter = "all" | "active" | "expiring" | "lapsed" | "comped";
export const USER_FILTERS: readonly UserFilter[] = ["all", "active", "expiring", "lapsed", "comped"];
export const MAX_PAGE = 50;
const DAY = 24 * 60 * 60 * 1000;
/** Far-future sentinel used for "lifetime / comp" access (Jan 1, 3000). */
const LIFETIME = 32503680000000;
const SCAN_BATCH = 100;
const MAX_BATCHES = 5;

export type AdminUserRow = {
  uid: string; email: string; displayName: string; photoURL: string | null;
  createdAt: number | null; lastSignIn: number | null;
  galleryCount: number; lastGalleryAt: number | null;
  subscriptionActive: boolean; subscriptionExpiresAt: number | null; compGranted: boolean;
  accessSource: AccessSource | null; promoCode: string | null;
  lastPaymentCents: number | null; lastPaymentCurrency: string | null;
  planId: string | null; planName: string | null; planInterval: string | null;
  paymentFlags: PaymentFlag[];
};
export type UsersPage = { users: AdminUserRow[]; nextCursor: string | null; total: number; needsBackfill: number };

type Cursor = { k: string | number; id: string };
const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if ((typeof c?.k === "string" || typeof c?.k === "number") && typeof c?.id === "string") return { k: c.k, id: c.id };
  } catch { /* fall through */ }
  return null;
}

/** Same rule everywhere: active means status "active" and not yet expired. */
export function matchesFilter(filter: UserFilter, d: DocumentData, now: number): boolean {
  const end = typeof d.subscriptionExpiresAt === "number" ? d.subscriptionExpiresAt : 0;
  const active = d.subscriptionStatus === "active" && end > now;
  switch (filter) {
    case "all": return true;
    case "active": return active;
    case "expiring": return active && end < LIFETIME && end - now <= 30 * DAY;
    case "lapsed": return end > 0 && end <= now;
    case "comped": return d.compGranted === true;
  }
}

/** The indexed query for a view, and the field it is ordered by. */
export function buildQuery(db: Firestore, filter: UserFilter, q: string, now: number): { query: Query; field: string } {
  const users = usersCol(db);
  if (q) {
    const needle = q.trim().toLowerCase();
    return { query: users.where("emailLower", ">=", needle).where("emailLower", "<=", needle + "").orderBy("emailLower").orderBy(FieldPath.documentId()), field: "emailLower" };
  }
  switch (filter) {
    case "active": return { query: users.where("subscriptionStatus", "==", "active").where("subscriptionExpiresAt", ">", now).orderBy("subscriptionExpiresAt").orderBy(FieldPath.documentId()), field: "subscriptionExpiresAt" };
    case "expiring": return { query: users.where("subscriptionStatus", "==", "active").where("subscriptionExpiresAt", ">", now).where("subscriptionExpiresAt", "<=", Math.min(now + 30 * DAY, LIFETIME - 1)).orderBy("subscriptionExpiresAt").orderBy(FieldPath.documentId()), field: "subscriptionExpiresAt" };
    case "lapsed": return { query: users.where("subscriptionExpiresAt", ">", 0).where("subscriptionExpiresAt", "<=", now).orderBy("subscriptionExpiresAt", "desc").orderBy(FieldPath.documentId(), "desc"), field: "subscriptionExpiresAt" };
    case "comped": return { query: users.where("compGranted", "==", true).orderBy("emailLower").orderBy(FieldPath.documentId()), field: "emailLower" };
    default: return { query: users.orderBy("emailLower").orderBy(FieldPath.documentId()), field: "emailLower" };
  }
}

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function enrich(db: Firestore, docs: QueryDocumentSnapshot[], now: number): Promise<AdminUserRow[]> {
  const uids = docs.map((d) => d.id);
  if (uids.length === 0) return [];
  const [authRes, payDocs, counts, lasts] = await Promise.all([
    getAdminAuth().getUsers(uids.map((uid) => ({ uid }))),
    Promise.all(chunk(uids, 30).map((c) => paymentsCol(db).where("uid", "in", c).get())).then((r) => r.flatMap((s) => s.docs)),
    Promise.all(uids.map(async (uid) => (await galleriesCol(db).where("photographerId", "==", uid).count().get()).data().count)),
    Promise.all(uids.map(async (uid) => {
      const s = await galleriesCol(db).where("photographerId", "==", uid).orderBy("createdAt", "desc").limit(1).select("createdAt").get();
      return s.empty ? null : (toMs(s.docs[0].get("createdAt")) ?? null);
    })),
  ]);
  const auth = new Map(authRes.users.map((u) => [u.uid, u]));
  const latest = latestPaymentByUid(payDocs);
  const flags = paymentFlagsByUid(payDocs);
  return docs.map((doc, i) => {
    const d = doc.data();
    const a = auth.get(doc.id);
    const end = typeof d.subscriptionExpiresAt === "number" ? d.subscriptionExpiresAt : 0;
    const comp = d.compGranted === true;
    const lp = latest.get(doc.id);
    const created = a ? Date.parse(a.metadata.creationTime) : NaN;
    const lastSign = a?.metadata.lastSignInTime ? Date.parse(a.metadata.lastSignInTime) : NaN;
    return {
      uid: doc.id,
      email: a?.email ?? (typeof d.email === "string" ? d.email : ""),
      // The Firestore `name` is what the user edits in Account settings; Auth's is the Google name.
      displayName: (typeof d.name === "string" && d.name) || a?.displayName || "",
      photoURL: (typeof d.photoURL === "string" && d.photoURL) || a?.photoURL || null,
      createdAt: Number.isFinite(created) ? created : toMs(d.createdAt),
      lastSignIn: Number.isFinite(lastSign) ? lastSign : null,
      galleryCount: counts[i], lastGalleryAt: lasts[i],
      subscriptionActive: d.subscriptionStatus === "active" && end > now,
      subscriptionExpiresAt: end || null, compGranted: comp,
      accessSource: accessSourceOf({ compGranted: comp, subscriptionSource: d.subscriptionSource, latest: lp }),
      promoCode: (typeof d.promoCode === "string" ? d.promoCode : null) ?? lp?.promoCode ?? null,
      lastPaymentCents: lp?.amountTotal ?? null, lastPaymentCurrency: lp?.currency ?? null,
      planId: typeof d.planId === "string" ? d.planId : null, planName: typeof d.planName === "string" ? d.planName : null, planInterval: typeof d.planInterval === "string" ? d.planInterval : null,
      paymentFlags: flags.get(doc.id) ?? [],
    };
  });
}

export async function listUsersPage(opts: { q?: string; filter?: UserFilter; cursor?: string | null; limit?: number }, db: Firestore = getAdminDb(), now = Date.now()): Promise<UsersPage> {
  const filter: UserFilter = opts.filter && USER_FILTERS.includes(opts.filter) ? opts.filter : "all";
  const limit = Math.min(MAX_PAGE, Math.max(1, Math.floor(opts.limit ?? 25)));
  const q = (opts.q ?? "").trim();
  const { query, field } = buildQuery(db, filter, q, now);
  // With a search the filter is applied to the matches; otherwise the query itself is the filter.
  const inMemory = q ? filter : "all";

  let cursor = decodeCursor(opts.cursor);
  const picked: QueryDocumentSnapshot[] = [];
  let resumeFrom: Cursor | null = null; // where the next page starts, when there is one
  scan: for (let b = 0; b < MAX_BATCHES; b++) {
    const size = inMemory === "all" ? limit + 1 : SCAN_BATCH;
    const snap = await (cursor ? query.startAfter(cursor.k, cursor.id) : query).limit(size).get();
    for (const doc of snap.docs) {
      if (!matchesFilter(inMemory, doc.data(), now)) continue;
      if (picked.length === limit) { // one more match exists beyond this page
        const last = picked[picked.length - 1];
        resumeFrom = { k: last.get(field), id: last.id };
        break scan;
      }
      picked.push(doc);
    }
    if (snap.docs.length < size) break; // nothing left
    const last = snap.docs[snap.docs.length - 1];
    cursor = { k: last.get(field), id: last.id };
    if (b === MAX_BATCHES - 1) resumeFrom = cursor; // scanned a lot without filling the page: continue from here next time
  }
  const nextCursor = resumeFrom ? encodeCursor(resumeFrom) : null;

  // How many people exist, and how many are not searchable yet because their `emailLower` is missing (S7-05 backfill).
  const [total, indexed] = await Promise.all([
    usersCol(db).count().get().then((s) => s.data().count),
    usersCol(db).where("emailLower", ">=", "").count().get().then((s) => s.data().count),
  ]);
  return { users: await enrich(db, picked, now), nextCursor, total, needsBackfill: Math.max(0, total - indexed) };
}

export type AdminUserDetail = {
  row: AdminUserRow;
  disabled: boolean; providers: string[];
  payments: { id: string; amountTotal: number | null; currency: string | null; status: string; needsReview: boolean; promoCode: string | null; refundedAmount: number | null; activatedAt: number }[];
  galleries: { id: string; name: string; slug: string; createdAt: number | null; visibility: string | null }[];
  activity: { id: string; at: number; action: string; actorUid: string; note: string | null }[];
};

export async function getUserDetail(uid: string, db: Firestore = getAdminDb(), now = Date.now()): Promise<AdminUserDetail | null> {
  const snap = await usersCol(db).doc(uid).get();
  if (!snap.exists) return null;
  const [rows, payments, galleries, audit, authUser] = await Promise.all([
    enrich(db, [snap as QueryDocumentSnapshot], now),
    paymentsCol(db).where("uid", "==", uid).orderBy("activatedAt", "desc").limit(20).get(),
    galleriesCol(db).where("photographerId", "==", uid).orderBy("createdAt", "desc").limit(20).get(),
    auditLogCol(db).where("targetId", "==", uid).orderBy("at", "desc").limit(15).get(),
    getAdminAuth().getUser(uid).catch(() => null),
  ]);
  return {
    row: rows[0],
    disabled: authUser?.disabled === true,
    providers: authUser?.providerData.map((p) => p.providerId) ?? [],
    payments: payments.docs.map((d) => ({
      id: d.id, amountTotal: typeof d.get("amountTotal") === "number" ? d.get("amountTotal") : null, currency: typeof d.get("currency") === "string" ? d.get("currency") : null,
      status: typeof d.get("status") === "string" ? d.get("status") : "fulfilled", needsReview: d.get("needsReview") === true,
      promoCode: typeof d.get("promoCode") === "string" ? d.get("promoCode") : null, refundedAmount: typeof d.get("refundedAmount") === "number" ? d.get("refundedAmount") : null,
      activatedAt: typeof d.get("activatedAt") === "number" ? d.get("activatedAt") : 0,
    })),
    galleries: galleries.docs.map((d) => ({ id: d.id, name: String(d.get("name") ?? ""), slug: String(d.get("slug") ?? ""), createdAt: toMs(d.get("createdAt")), visibility: typeof d.get("visibility") === "string" ? d.get("visibility") : null })),
    activity: audit.docs.map((d) => ({ id: d.id, at: Number(d.get("at") ?? 0), action: String(d.get("action") ?? ""), actorUid: String(d.get("actorUid") ?? ""), note: typeof d.get("note") === "string" ? d.get("note") : null })),
  };
}

