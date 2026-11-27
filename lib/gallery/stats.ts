/**
 * Gallery usage counts, pure helpers (S10-02). Stored in `gallery_stats/{galleryId}` as running totals plus per-day buckets for the last
 * 30 days. Only counts and the time of the last visit are kept: no IP address, no user agent, no visitor id, nothing that identifies a
 * person (see docs/security-model.md, "Usage counts").
 */
export type StatKind = "view" | "download" | "favorite";
export type DayCounts = { views?: number; downloads?: number; favorites?: number };
export type StatsDoc = { views?: number; downloads?: number; favorites?: number; lastViewAt?: number; days?: Record<string, DayCounts> };

/** What the dashboard card shows. */
export type StatsSummary = {
  views: number; downloads: number; favorites: number;
  /** Time of the most recent visit, or null if nobody has opened the gallery yet. */
  lastViewAt: number | null;
  /** The same counts over the last 30 days. */
  last30: { views: number; downloads: number; favorites: number };
};

export const STAT_FIELD: Record<StatKind, "views" | "downloads" | "favorites"> = { view: "views", download: "downloads", favorite: "favorites" };
export const KEEP_DAYS = 30;
const DAY_MS = 86_400_000;

/** The UTC day of a time, "YYYY-MM-DD". */
export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The day buckets older than the last 30 days (today included), which are to be deleted. */
export function staleDays(days: Record<string, unknown> | undefined, now: number): string[] {
  const oldest = dayKey(now - (KEEP_DAYS - 1) * DAY_MS);
  return Object.keys(days ?? {}).filter((d) => d < oldest);
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function summarize(doc: StatsDoc | undefined, now: number): StatsSummary {
  const oldest = dayKey(now - (KEEP_DAYS - 1) * DAY_MS);
  const last30 = { views: 0, downloads: 0, favorites: 0 };
  for (const [day, c] of Object.entries(doc?.days ?? {})) {
    if (day < oldest) continue;
    last30.views += num(c.views); last30.downloads += num(c.downloads); last30.favorites += num(c.favorites);
  }
  return {
    views: num(doc?.views), downloads: num(doc?.downloads), favorites: num(doc?.favorites),
    lastViewAt: typeof doc?.lastViewAt === "number" ? doc.lastViewAt : null,
    last30,
  };
}
