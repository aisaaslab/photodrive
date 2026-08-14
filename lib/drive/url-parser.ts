/**
 * Extracts the folder ID from various Google Drive folder URL formats.
 * Returns null if the URL is not a valid Drive folder URL.
 */
export function extractFolderId(url: string): string | null {
  const patterns = [
    // https://drive.google.com/drive/folders/FOLDER_ID
    // https://drive.google.com/drive/u/0/folders/FOLDER_ID
    /\/folders\/([a-zA-Z0-9_-]+)/,
    // https://drive.google.com/open?id=FOLDER_ID
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}
