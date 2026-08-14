import { unstable_cache } from "next/cache";
import { DriveFile, DriveFolder, DriveFolderResult } from "./types";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

// How long (seconds) a folder listing is cached before re-reading from Drive.
// Kept short so newly added/removed photos & videos show up quickly.
const FOLDER_CACHE_TTL = 60;

async function fetchFilesInFolder(folderId: string, apiKey: string, folderName?: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      key: apiKey,
      q: `"${folderId}" in parents and (mimeType contains "image/" or mimeType contains "video/") and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,thumbnailLink,imageMediaMetadata(width,height),videoMediaMetadata(width,height))",
      pageSize: "100",
      // "name_natural" sorts IMG_2 before IMG_10 (human order). Plain "name"
      // sorts lexicographically, which puts IMG_10 before IMG_2 and looks random.
      orderBy: "name_natural",
      ...(pageToken ? { pageToken } : {}),
    });

    const res = await fetch(`${DRIVE_API_BASE}/files?${params}`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error?.message ?? "Failed to fetch Drive folder");
    }
    const data = await res.json();

    for (const file of data.files ?? []) {
      files.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        thumbnailLink: file.thumbnailLink,
        width: file.imageMediaMetadata?.width ?? file.videoMediaMetadata?.width,
        height: file.imageMediaMetadata?.height ?? file.videoMediaMetadata?.height,
        ...(folderName ? { folder: folderName } : {}),
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

async function fetchSubfoldersInFolder(folderId: string, apiKey: string): Promise<DriveFolder[]> {
  const params = new URLSearchParams({
    key: apiKey,
    q: `"${folderId}" in parents and mimeType = "application/vnd.google-apps.folder" and trashed = false`,
    fields: "files(id,name)",
    pageSize: "50",
    orderBy: "name_natural",
  });

  const res = await fetch(`${DRIVE_API_BASE}/files?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.files ?? []).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }));
}

/**
 * Recursively fetches a folder's subtree. Subfolders are traversed in parallel
 * (instead of one-by-one), while output order is preserved: a folder's own files
 * come first, then each subfolder's subtree in name order.
 */
async function fetchSubtree(
  folderId: string,
  apiKey: string,
  folderName: string | undefined,
  parentPath: string,
  depth = 0
): Promise<{ files: DriveFile[]; folders: DriveFolder[] }> {
  if (depth > 4) return { files: [], folders: [] }; // safety limit

  const [files, subfolders] = await Promise.all([
    fetchFilesInFolder(folderId, apiKey, folderName),
    fetchSubfoldersInFolder(folderId, apiKey),
  ]);

  const childResults = await Promise.all(
    subfolders.map(async (sf) => {
      const path = parentPath ? `${parentPath} / ${sf.name}` : sf.name;
      const sub = await fetchSubtree(sf.id, apiKey, sf.name, path, depth + 1);
      return { folder: { id: sf.id, name: sf.name, path } as DriveFolder, sub };
    })
  );

  const allFiles = [...files];
  const allFolders: DriveFolder[] = [];
  for (const { folder, sub } of childResults) {
    allFolders.push(folder, ...sub.folders);
    allFiles.push(...sub.files);
  }
  return { files: allFiles, folders: allFolders };
}

async function fetchDriveFolderUncached(folderId: string): Promise<DriveFolderResult> {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_DRIVE_API_KEY is not set");

  const { files, folders } = await fetchSubtree(folderId, apiKey, undefined, "");
  return { files, subfolders: folders };
}

/**
 * Fetches all image/video files from a Drive folder, recursively including all subfolders.
 * The result is cached for a few minutes so repeat gallery loads are instant; photos
 * added/removed in Drive appear after the cache window (FOLDER_CACHE_TTL).
 */
export async function fetchDriveFolder(folderId: string): Promise<DriveFolderResult> {
  const cached = unstable_cache(
    () => fetchDriveFolderUncached(folderId),
    ["drive-folder", folderId],
    { revalidate: FOLDER_CACHE_TTL, tags: [`drive-folder-${folderId}`] }
  );
  return cached();
}
