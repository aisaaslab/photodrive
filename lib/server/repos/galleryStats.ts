import "server-only";
import { FieldPath, FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { createLogger } from "@/lib/server/log";
import { STAT_FIELD, dayKey, staleDays, summarize, type StatKind, type StatsDoc, type StatsSummary } from "@/lib/gallery/stats";
import { galleryStatsCol } from "./collections";

/**
 * Usage counts of a gallery (S10-02): views, downloads and favourites, as totals and as per-day buckets. Increments only, no read, so
 * a visitor downloading 300 photos adds 300 cheap writes, not 300 transactions. Counting is best-effort: a failed write is logged and
 * never breaks the page, the download or the favourite it was counting.
 */
export async function recordGalleryEvent(galleryId: string, kind: StatKind, opts: { n?: number; now?: number; db?: Firestore } = {}): Promise<void> {
  const n = opts.n ?? 1;
  if (n <= 0) return;
  const now = opts.now ?? Date.now();
  const field = STAT_FIELD[kind];
  try {
    const db = opts.db ?? getAdminDb();
    await galleryStatsCol(db).doc(galleryId).set({
      galleryId,
      [field]: FieldValue.increment(n),
      ...(kind === "view" ? { lastViewAt: now } : {}),
      days: { [dayKey(now)]: { [field]: FieldValue.increment(n) } },
    }, { merge: true });
    // Views are the rare event (once per visitor session), so that is when buckets older than 30 days are dropped.
    if (kind === "view") await pruneOldDays(galleryId, now, db);
  } catch (err) {
    createLogger({ scope: "gallery-stats" }).warn("could not record a gallery event", { galleryId, kind, err: String(err) });
  }
}

export async function pruneOldDays(galleryId: string, now: number, db: Firestore = getAdminDb()): Promise<number> {
  const ref = galleryStatsCol(db).doc(galleryId);
  const snap = await ref.get();
  const stale = staleDays((snap.data() as StatsDoc | undefined)?.days, now);
  if (stale.length === 0) return 0;
  const [first, ...rest] = stale;
  await ref.update(new FieldPath("days", first), FieldValue.delete(), ...rest.flatMap((d) => [new FieldPath("days", d), FieldValue.delete()]));
  return stale.length;
}

/** Summaries for many galleries in one batched read; galleries nobody has visited are simply absent from the map. */
export async function getStatsSummaries(galleryIds: string[], now = Date.now(), db: Firestore = getAdminDb()): Promise<Map<string, StatsSummary>> {
  const out = new Map<string, StatsSummary>();
  const CHUNK = 300;
  for (let i = 0; i < galleryIds.length; i += CHUNK) {
    const ids = galleryIds.slice(i, i + CHUNK);
    if (ids.length === 0) continue;
    const snaps = await db.getAll(...ids.map((id) => galleryStatsCol(db).doc(id)));
    snaps.forEach((s, idx) => { if (s.exists) out.set(ids[idx], summarize(s.data() as StatsDoc, now)); });
  }
  return out;
}
