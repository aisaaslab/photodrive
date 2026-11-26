import type { Visibility } from "@/lib/gallery/visibility";

/** Pure rules of the "new gallery" form (S5-09), so they are tested without a browser. */
export type SocialKey = "website" | "instagram" | "facebook";

export type NewGalleryValues = {
  name: string;
  driveUrl: string;
  password: string;
  visibility: Visibility;
  social: Record<SocialKey, string>;
  /** Which link rows the photographer switched on; a row that is off is not sent. */
  socialOn: Record<SocialKey, boolean>;
  description: string;
  eventDate: string;
  location: string;
};

/** What the form is restored from after a payment (see `pendingGalleryOf`). */
export type NewGalleryInitial = {
  name: string;
  driveUrl: string;
  password: string;
  visibility?: Visibility;
  website?: string;
  instagram?: string;
  facebook?: string;
  description?: string;
  eventDate?: string;
  location?: string;
};

export function isValidDriveUrl(url: string): boolean {
  return /drive\.google\.com\/(drive\/folders\/|open\?id=|folderview\?id=)/.test(url);
}

/** The values a form starts with. A form saved before visibility existed has a password (private) or none (public). */
export function initialValues(initial?: NewGalleryInitial): NewGalleryValues {
  return {
    name: initial?.name ?? "",
    driveUrl: initial?.driveUrl ?? "",
    password: initial?.password ?? "",
    visibility: initial?.visibility ?? (initial?.password ? "private" : "public"),
    social: { website: initial?.website ?? "", instagram: initial?.instagram ?? "", facebook: initial?.facebook ?? "" },
    socialOn: { website: !!initial?.website, instagram: !!initial?.instagram, facebook: !!initial?.facebook },
    description: initial?.description ?? "",
    eventDate: initial?.eventDate ?? "",
    location: initial?.location ?? "",
  };
}

/** The body of POST /api/galleries. Empty optional fields are `undefined` so they are left out of the JSON; a public gallery sends no password. */
export function createGalleryBody(v: NewGalleryValues) {
  return {
    name: v.name,
    driveUrl: v.driveUrl,
    visibility: v.visibility,
    password: v.visibility === "private" ? v.password : undefined,
    website: v.socialOn.website ? v.social.website.trim() || undefined : undefined,
    instagram: v.socialOn.instagram ? v.social.instagram.trim() || undefined : undefined,
    facebook: v.socialOn.facebook ? v.social.facebook.trim() || undefined : undefined,
    description: v.description.trim() || undefined,
    eventDate: v.eventDate || undefined,
    location: v.location.trim() || undefined,
  };
}

/** What is kept in the browser while the visitor pays, so the gallery they filled in can be created afterwards. Switched-off link rows are cleared. */
export function pendingGalleryOf(v: NewGalleryValues): NewGalleryInitial {
  return {
    name: v.name,
    driveUrl: v.driveUrl,
    password: v.password,
    visibility: v.visibility,
    website: v.socialOn.website ? v.social.website : "",
    instagram: v.socialOn.instagram ? v.social.instagram : "",
    facebook: v.socialOn.facebook ? v.social.facebook : "",
    description: v.description,
    eventDate: v.eventDate,
    location: v.location,
  };
}
