export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
  thumbnailLink?: string;
  folder?: string; // subfolder name, undefined = root
  /**
   * Protected tier only (S3-03): signed same-site URLs. When present, `id` is an opaque token rather than a Drive file id and
   * `thumbnailLink` is absent; every image, download and video for this photo must use these URLs.
   */
  urls?: PhotoUrls;
}

export interface PhotoUrls {
  thumb: string;
  preview: string;
  /** Only when downloads are allowed. */
  full?: string;
  /** Videos: the original for in-page playback. */
  stream?: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  path: string; // e.g. "Wedding / Ceremony / Church"
}

export interface DriveFolderResult {
  files: DriveFile[];
  subfolders: DriveFolder[];
}

export interface DriveFileList {
  files: DriveFile[];
  nextPageToken?: string;
}
