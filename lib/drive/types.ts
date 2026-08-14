export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
  thumbnailLink?: string;
  folder?: string; // subfolder name, undefined = root
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
