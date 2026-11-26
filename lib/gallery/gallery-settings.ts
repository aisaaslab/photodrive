import type { GalleryDoc } from "@/lib/firestore/types";
import { APP_URL } from "@/lib/branding";
import { galleryVisibility, isPrivate, type Visibility } from "@/lib/gallery/visibility";

/** Pure rules of a gallery's settings dialog and the client-favourites marker on its card (S5-07), so they are tested without a browser. */
export type SettingsValues = {
  name: string;
  driveUrl: string;
  password: string;
  visibility: Visibility;
  /** The "yes, remove the password" tick needed to switch a private gallery to public. */
  confirmMakePublic: boolean;
  allowDownload: boolean;
  social: { website: string; instagram: string; facebook: string };
  description: string;
  eventDate: string;
  location: string;
  bookLink: string;
  bookEnabled: boolean;
  titleFont: string;
  titleColor: string;
  titleSize: string;
  headerBranding: boolean;
};

/** The dialog's values for a gallery: what it opens with, and what Cancel puts back. */
export function settingsFrom(gallery: GalleryDoc): SettingsValues {
  return {
    name: gallery.name,
    driveUrl: `https://drive.google.com/drive/folders/${gallery.folderId}`,
    password: gallery.password ?? "",
    // Public / private (D18). Switching a private gallery to public removes its password, so it needs a confirmation.
    visibility: galleryVisibility(gallery),
    confirmMakePublic: false,
    allowDownload: gallery.allowDownload !== false,
    social: { website: gallery.website ?? "", instagram: gallery.instagram ?? "", facebook: gallery.facebook ?? "" },
    description: gallery.description ?? "",
    eventDate: gallery.eventDate ?? "",
    location: gallery.location ?? "",
    bookLink: gallery.bookLink ?? "",
    bookEnabled: gallery.bookEnabled === true,
    titleFont: gallery.titleFont ?? "classic",
    titleColor: gallery.titleColor ?? "#ffffff",
    titleSize: gallery.titleSize ?? "md",
    headerBranding: gallery.headerBranding === "photographer",
  };
}

/**
 * Why Save is refused before anything is sent, if it is: a gallery made private needs a password (one that was already private
 * keeps its own), and a private gallery made public needs the removal of its password confirmed. An empty name is a silent no-op
 * (the Save button is disabled for it).
 */
export function settingsProblem(values: SettingsValues, gallery: GalleryDoc): "passwordRequired" | "confirmMakePublic" | null {
  const wasPrivate = isPrivate(gallery);
  if (values.visibility === "private" && !values.password && !wasPrivate) return "passwordRequired";
  if (values.visibility === "public" && wasPrivate && !values.confirmMakePublic) return "confirmMakePublic";
  return null;
}

/** The body of PATCH /api/galleries/[id]. The password is sent only when it is new: re-sending the stored one would log every visitor out on each save. */
export function buildSettingsPatch(values: SettingsValues, gallery: GalleryDoc): Record<string, unknown> {
  const body: Record<string, unknown> = { name: values.name.trim() };
  body.visibility = values.visibility;
  if (values.visibility === "private" && values.password && values.password !== gallery.password) body.password = values.password;
  body.website = values.social.website.trim();
  body.instagram = values.social.instagram.trim();
  body.facebook = values.social.facebook.trim();
  body.allowDownload = values.allowDownload;
  body.description = values.description.trim();
  body.eventDate = values.eventDate;
  body.location = values.location.trim();
  body.bookLink = values.bookLink.trim();
  body.bookEnabled = values.bookEnabled;
  body.titleFont = values.titleFont;
  body.titleColor = values.titleColor;
  body.titleSize = values.titleSize;
  body.headerBranding = values.headerBranding ? "photographer" : null;
  return body;
}

/** What the dialog's values become after a successful save: the stored password and visibility come back from the server, the confirmation resets, and the Drive link field is cleared. */
export function settingsAfterSave(values: SettingsValues, updated: { password?: string | null; visibility?: Visibility }): SettingsValues {
  return { ...values, driveUrl: "", password: updated.password ?? "", visibility: updated.visibility ?? "public", confirmMakePublic: false };
}

/** The time up to which the photographer has seen a gallery's favourites. */
export const selectionSeenAt = (gallery: Pick<GalleryDoc, "selectionUpdatedAt" | "selectionSubmittedAt">, now: number) =>
  Math.max(gallery.selectionUpdatedAt ?? 0, gallery.selectionSubmittedAt ?? 0, now);

/** Whether the card shows the "new" marker: the client has favourites or sent a selection, and it changed since the photographer last looked. */
export function hasNewSelections(
  gallery: Pick<GalleryDoc, "selectionCount" | "selectionUpdatedAt" | "selectionSubmittedAt">,
  seenAt: number,
): boolean {
  return ((gallery.selectionCount ?? 0) > 0 || !!gallery.selectionSubmittedAt) &&
    Math.max(gallery.selectionUpdatedAt ?? 0, gallery.selectionSubmittedAt ?? 0) > seenAt;
}

/** The public address of a gallery: what "Copy link" copies and "Open" opens. */
export const galleryUrl = (gallery: Pick<GalleryDoc, "slug">) => `${APP_URL}/gallery/${gallery.slug}`;
