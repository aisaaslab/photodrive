/**
 * Is this Drive folder usable as a gallery? (S10-03.) Asks Drive, with the app's read-only key, whether the folder is reachable and
 * what is directly inside it, so the create form can say "not shared", "empty" or "42 photos" before a gallery is made. Pure apart from
 * the injected `fetch`, so it is tested without the network. A folder that is not shared with "Anyone with the link" answers 404 to
 * the key, exactly like a folder that does not exist, so the two cannot be told apart and share one message.
 */
export type FolderCheck =
  | { status: "ok"; name: string; photos: number; videos: number; subfolders: number; /** More files than one Drive page: the counts are lower bounds. */ capped: boolean; /** No photos at the top level, but some in a subfolder. */ inSubfolders: boolean }
  | { status: "empty" | "unsupported"; name: string }
  | { status: "notFound" | "notFolder" | "unavailable"; name?: undefined };

const API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
/** Subfolders probed for photos when the top level has none (the gallery itself reads the whole tree). */
const PROBE_SUBFOLDERS = 5;

type Fetch = (url: string) => Promise<Pick<Response, "ok" | "status" | "json">>;

export async function checkDriveFolder(folderId: string, apiKey: string, doFetch: Fetch = fetch): Promise<FolderCheck> {
  const get = async (path: string, params: Record<string, string>) => {
    try {
      return await doFetch(`${API}${path}?${new URLSearchParams({ key: apiKey, ...params })}`);
    } catch {
      return null;
    }
  };

  const meta = await get(`/files/${encodeURIComponent(folderId)}`, { fields: "id,name,mimeType" });
  if (!meta) return { status: "unavailable" };
  if (meta.status === 404) return { status: "notFound" };
  if (!meta.ok) return { status: "unavailable" }; // quota, key problem, Drive outage: not the visitor's fault
  const info = (await meta.json().catch(() => null)) as { name?: string; mimeType?: string } | null;
  if (!info) return { status: "unavailable" };
  if (info.mimeType !== FOLDER_MIME) return { status: "notFolder" };
  const name = info.name ?? "";

  const list = await get("/files", {
    q: `"${folderId}" in parents and trashed = false`,
    fields: "nextPageToken,files(id,mimeType)",
    pageSize: "1000",
  });
  if (!list || !list.ok) return { status: "unavailable" };
  const page = (await list.json().catch(() => null)) as { files?: { id: string; mimeType: string }[]; nextPageToken?: string } | null;
  if (!page) return { status: "unavailable" };

  let photos = 0, videos = 0, other = 0;
  const folders: string[] = [];
  for (const f of page.files ?? []) {
    if (f.mimeType.startsWith("image/")) photos++;
    else if (f.mimeType.startsWith("video/")) videos++;
    else if (f.mimeType === FOLDER_MIME) folders.push(f.id);
    else other++;
  }
  const capped = !!page.nextPageToken;

  if (photos + videos > 0) return { status: "ok", name, photos, videos, subfolders: folders.length, capped, inSubfolders: false };

  // Nothing at the top level: photographers often keep photos in sub-folders, which the gallery includes.
  for (const id of folders.slice(0, PROBE_SUBFOLDERS)) {
    const probe = await get("/files", {
      q: `"${id}" in parents and (mimeType contains "image/" or mimeType contains "video/") and trashed = false`,
      fields: "files(id)",
      pageSize: "1",
    });
    if (probe?.ok && ((await probe.json().catch(() => null)) as { files?: unknown[] } | null)?.files?.length) {
      return { status: "ok", name, photos: 0, videos: 0, subfolders: folders.length, capped, inSubfolders: true };
    }
  }
  return { status: other > 0 && folders.length === 0 ? "unsupported" : "empty", name };
}
