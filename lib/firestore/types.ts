export interface GalleryDoc {
  id: string;
  photographerId: string;
  name: string;
  slug: string;
  folderId: string;
  passwordHash?: string;
  password?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  // When false, download buttons are hidden in the gallery (e.g. show photos
  // for album selection before the client has paid). Defaults to true.
  allowDownload?: boolean;
  // Optional subtitle shown under the gallery name on the public page.
  description?: string;
  // Optional event date as "YYYY-MM-DD"; rendered locale-aware on the gallery.
  eventDate?: string;
  // Optional event location (e.g. "Santorini, Greece").
  location?: string;
  // Optional Drive file id of a photo chosen by the photographer as the
  // gallery's cover/hero image. null/undefined => gradient fallback.
  coverFileId?: string | null;
  // "Book this photographer" CTA: a URL the client can click to contact the
  // photographer (mailto:, https://wa.me/, https://m.me/, any URL). When
  // bookEnabled is false (or bookLink is empty), the CTA is hidden.
  bookLink?: string;
  bookEnabled?: boolean;
  // Gallery title styling, picked by the photographer from a curated set.
  // titleFont: one of TITLE_FONT_IDS in lib/gallery/title-style.ts ("classic"
  // when unset). titleColor: a 6-digit hex (white when unset). titleSize: one
  // of TITLE_SIZE_IDS ("md", the default look, when unset).
  titleFont?: string | null;
  titleColor?: string | null;
  titleSize?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface UserDoc {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  createdAt: number;
  subscriptionStatus?: "active" | "expired" | "none";
  subscriptionExpiresAt?: number;
  stripeCustomerId?: string;
}

export interface FavoriteDoc {
  galleryId: string;
  photoId: string;
  sessionId: string;
  createdAt: number;
}
