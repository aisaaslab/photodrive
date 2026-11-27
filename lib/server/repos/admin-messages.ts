import "server-only";
import { FieldPath, type DocumentData, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { decodeCursor, pageThrough } from "@/lib/server/repos/paging";
import { contactMessagesCol, usersCol } from "@/lib/server/repos/collections";
import { MESSAGE_FILTERS, matchesMessageFilter, matchesMessageSearch, messageState, type MessageFilter, type MessageState } from "@/lib/shared/support";

/**
 * What the admin Support inbox reads (S8-02). Messages are listed newest first, a page at a time; the filter and the search are applied
 * to the page in memory (contact messages are few), so no database index is needed. Each message is matched to the customer account that
 * has the sender's e-mail address, so the account and its payments are one click away. The sender's IP hash and browser string are
 * stored with the message for abuse handling and are never sent to the screen.
 */
export { decodeCursor, MESSAGE_FILTERS };
export const MAX_PAGE = 50;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export type MatchedAccount = { uid: string; name: string | null; email: string; subscriptionExpiresAt: number | null; active: boolean };
export type AdminMessage = {
  id: string; name: string; email: string; subject: string; message: string; createdAt: number;
  /** Old inbox fields, kept so the Settings page keeps working until it is retired (S8-05). */
  read: boolean; emailed: boolean;
  state: MessageState; resolvedAt: number | null; resolvedBy: string | null;
  note: string | null; noteAt: number | null; noteBy: string | null;
  account: MatchedAccount | null;
};
export type MessageCounts = { total: number; unread: number; open: number; resolved: number };
export type MessagesPage = { messages: AdminMessage[]; nextCursor: string | null; counts: MessageCounts };

function rowOf(doc: QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot, accounts: Map<string, MatchedAccount>): AdminMessage {
  const d: DocumentData = doc.data() ?? {};
  const email = str(d.email).toLowerCase();
  return {
    id: doc.id, name: str(d.name), email: str(d.email), subject: str(d.subject), message: str(d.message), createdAt: num(d.createdAt) ?? 0,
    read: d.read === true, emailed: d.emailed === true,
    state: messageState(d), resolvedAt: num(d.resolvedAt), resolvedBy: str(d.resolvedBy) || null,
    note: str(d.note) || null, noteAt: num(d.noteAt), noteBy: str(d.noteBy) || null,
    account: accounts.get(email) ?? null,
  };
}

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** The customer account behind each e-mail address, found through Firebase Auth (so it works for every account, indexed or not). */
export async function matchAccounts(emails: string[], db: Firestore = getAdminDb(), now = Date.now()): Promise<Map<string, MatchedAccount>> {
  const out = new Map<string, MatchedAccount>();
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];
  if (unique.length === 0) return out;
  const found = (await Promise.all(chunk(unique, 100).map((c) => getAdminAuth().getUsers(c.map((email) => ({ email })))))).flatMap((r) => r.users);
  if (found.length === 0) return out;
  const snaps = await db.getAll(...found.map((u) => usersCol(db).doc(u.uid)));
  found.forEach((u, i) => {
    const d = snaps[i].data() ?? {};
    const end = num(d.subscriptionExpiresAt);
    out.set((u.email ?? "").toLowerCase(), {
      uid: u.uid, email: u.email ?? "", name: str(d.name) || u.displayName || null, subscriptionExpiresAt: end,
      active: d.subscriptionStatus === "active" && (end ?? 0) > now,
    });
  });
  return out;
}

/**
 * Counts for the filter chips. Two plain equality counts (no composite index): `read == true` and `status == "resolved"`. A resolved
 * message is always also read (resolving marks it read, and it cannot be marked unread again while resolved), so unread = total - read.
 * Messages from before `read` and `status` existed have neither field and so count as unread, which is what they are.
 */
export async function messageCounts(db: Firestore = getAdminDb()): Promise<MessageCounts> {
  const col = contactMessagesCol(db);
  const [total, resolved, read] = await Promise.all([
    col.count().get().then((s) => s.data().count),
    col.where("status", "==", "resolved").count().get().then((s) => s.data().count),
    col.where("read", "==", true).count().get().then((s) => s.data().count),
  ]);
  return { total, resolved, open: Math.max(0, total - resolved), unread: Math.max(0, total - read) };
}

export async function listMessagesPage(opts: { q?: string; filter?: MessageFilter; cursor?: string | null; limit?: number }, db: Firestore = getAdminDb()): Promise<MessagesPage> {
  const filter: MessageFilter = opts.filter && MESSAGE_FILTERS.includes(opts.filter) ? opts.filter : "all";
  const limit = Math.min(MAX_PAGE, Math.max(1, Math.floor(opts.limit ?? 25)));
  const q = (opts.q ?? "").trim();
  const query = contactMessagesCol(db).orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  const keep = filter === "all" && !q ? undefined : (d: DocumentData) => matchesMessageFilter(filter, d) && matchesMessageSearch(d, q);
  const { docs, nextCursor } = await pageThrough({ query, field: "createdAt", limit, cursor: decodeCursor(opts.cursor), keep });
  const [accounts, counts] = await Promise.all([matchAccounts(docs.map((d) => str(d.get("email"))), db), messageCounts(db)]);
  return { messages: docs.map((d) => rowOf(d, accounts)), nextCursor, counts };
}

export async function getMessage(id: string, db: Firestore = getAdminDb()): Promise<AdminMessage | null> {
  const snap = await contactMessagesCol(db).doc(id).get();
  if (!snap.exists) return null;
  return rowOf(snap, await matchAccounts([str(snap.get("email"))], db));
}
