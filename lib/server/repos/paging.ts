import "server-only";
import type { DocumentData, Query, QueryDocumentSnapshot } from "firebase-admin/firestore";

/**
 * Cursor paging for the admin lists (S7-05, S7-06). A page is one indexed query; when a filter has to be applied in memory (a search combined
 * with a status) it scans a few batches until the page is full. The cursor is the value of the ordering field plus the document id, so it
 * is stable when documents are added or removed between pages.
 */
export type Cursor = { k: string | number; id: string };
export const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if ((typeof c?.k === "string" || typeof c?.k === "number") && typeof c?.id === "string") return { k: c.k, id: c.id };
  } catch { /* fall through */ }
  return null;
}

const SCAN_BATCH = 100;
const MAX_BATCHES = 5;

/**
 * `query` must already be ordered by `field` and then by document id. `keep` filters in memory (omit it when the query is the whole filter).
 * Returns up to `limit` documents and the cursor of the next page (null at the end).
 */
export async function pageThrough(opts: { query: Query; field: string; limit: number; cursor: Cursor | null; keep?: (data: DocumentData) => boolean }): Promise<{ docs: QueryDocumentSnapshot[]; nextCursor: string | null }> {
  const { query, field, limit, keep } = opts;
  let cursor = opts.cursor;
  const picked: QueryDocumentSnapshot[] = [];
  let resumeFrom: Cursor | null = null;
  scan: for (let b = 0; b < MAX_BATCHES; b++) {
    const size = keep ? SCAN_BATCH : limit + 1;
    const snap = await (cursor ? query.startAfter(cursor.k, cursor.id) : query).limit(size).get();
    for (const doc of snap.docs) {
      if (keep && !keep(doc.data())) continue;
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
  return { docs: picked, nextCursor: resumeFrom ? encodeCursor(resumeFrom) : null };
}
