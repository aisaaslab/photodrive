/** A photo as the cover picker lists it (from GET /api/galleries/[id]/photos, which strips everything else). */
export interface PickerPhoto {
  id: string;
  name: string;
  thumbnailLink: string | null;
  width?: number | null;
  height?: number | null;
}

/** What the picker saved — merged into the gallery by the parent. */
export interface CoverSaved {
  coverFileId: string | null;
  coverPosX: number | null;
  coverPosY: number | null;
}

/** Focal point of the cover, in percent on each axis. */
export interface Pos {
  x: number;
  y: number;
}
