import type { FolderCheck } from "./check";

/** What the create form tells the photographer about a Drive folder (S10-03): a tone for its colour and a dictionary key (plus a count). */
export type DriveCheckView = { tone: "good" | "warn" | "muted"; key: "driveOk" | "driveOkSub" | "driveEmpty" | "driveUnsupported" | "driveNotFound" | "driveNotFolder" | "driveUnavailable"; count?: number };

/** The answer of POST /api/drive/check; "invalid" is a link the form already rejects. */
export type DriveCheckResult = FolderCheck | { status: "invalid"; name?: undefined };

export function driveCheckView(r: DriveCheckResult): DriveCheckView | null {
  switch (r.status) {
    case "ok": return r.inSubfolders ? { tone: "good", key: "driveOkSub" } : { tone: "good", key: "driveOk", count: r.photos + r.videos };
    case "empty": return { tone: "warn", key: "driveEmpty" };
    case "unsupported": return { tone: "warn", key: "driveUnsupported" };
    case "notFound": return { tone: "warn", key: "driveNotFound" };
    case "notFolder": return { tone: "warn", key: "driveNotFolder" };
    case "unavailable": return { tone: "muted", key: "driveUnavailable" };
    default: return null;
  }
}
