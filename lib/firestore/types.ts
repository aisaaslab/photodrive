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
