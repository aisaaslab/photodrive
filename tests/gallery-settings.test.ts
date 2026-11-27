import { describe, expect, it } from "vitest";
import type { GalleryDoc } from "@/lib/firestore/types";
import {
  buildSettingsPatch, galleryUrl, hasNewSelections, selectionSeenAt, settingsAfterSave, settingsFrom, settingsProblem,
} from "@/lib/gallery/gallery-settings";

const gallery = (over: Partial<GalleryDoc> = {}): GalleryDoc =>
  ({ id: "g1", photographerId: "u", name: "Public test", slug: "pubtest", folderId: "FOLDER1", createdAt: 1, updatedAt: 1, ...over }) as GalleryDoc;
const privateGallery = () => gallery({ passwordHash: "x", visibility: "private", password: "old-secret" });

describe("gallery settings rules (S5-07)", () => {
  it("opens with the gallery's own values, and defaults for what it has not set", () => {
    expect(settingsFrom(gallery())).toEqual({
      name: "Public test", driveUrl: "https://drive.google.com/drive/folders/FOLDER1", password: "", visibility: "public", confirmMakePublic: false,
      allowDownload: true, disableDownloadAfterSubmit: false, social: { website: "", instagram: "", facebook: "" }, description: "", eventDate: "", location: "", expiresAt: "", bookLink: "", bookEnabled: false,
      titleFont: "classic", titleColor: "#ffffff", titleSize: "md", headerBranding: false,
    });
    const v = settingsFrom(gallery({ allowDownload: false, instagram: "i", bookEnabled: true, titleFont: "serif", titleColor: "#f2c4c4", titleSize: "lg", headerBranding: "photographer", description: "d" }));
    expect(settingsFrom(gallery({ disableDownloadAfterSubmit: true })).disableDownloadAfterSubmit).toBe(true);
    // S9-05: the expiry date shows as a plain date, and an empty one clears it
    expect(settingsFrom(gallery({ expiresAt: Date.UTC(2027, 2, 1, 23, 59, 59, 999) })).expiresAt).toBe("2027-03-01");
    expect(settingsFrom(gallery({ expiresAt: null })).expiresAt).toBe("");
    expect(v).toMatchObject({ allowDownload: false, bookEnabled: true, titleFont: "serif", titleColor: "#f2c4c4", titleSize: "lg", headerBranding: true, description: "d" });
    expect(v.social.instagram).toBe("i");
    expect(settingsFrom(privateGallery())).toMatchObject({ visibility: "private", password: "old-secret" });
  });

  it("the patch has exactly the fields and order the dashboard has always sent (as recorded in the browser snapshot)", () => {
    const v = { ...settingsFrom(privateGallery()), password: "new-secret-9" };
    expect(buildSettingsPatch(v, privateGallery())).toEqual({
      name: "Public test", visibility: "private", password: "new-secret-9", website: "", instagram: "", facebook: "", allowDownload: true, disableDownloadAfterSubmit: false, description: "",
      eventDate: "", location: "", expiresAt: "", bookLink: "", bookEnabled: false, titleFont: "classic", titleColor: "#ffffff", titleSize: "md", headerBranding: null,
    });
    expect(Object.keys(buildSettingsPatch(v, privateGallery()))).toEqual([
      "name", "visibility", "password", "website", "instagram", "facebook", "allowDownload", "disableDownloadAfterSubmit", "description", "eventDate", "location", "expiresAt", "bookLink",
      "bookEnabled", "titleFont", "titleColor", "titleSize", "headerBranding",
    ]);
  });

  it("a full edit is trimmed and carries the appearance, downloads and links", () => {
    const v = { ...settingsFrom(gallery()), name: "  Public test (edited)  ", description: " A description ", eventDate: "2026-06-15", location: " Santorini, Greece ",
      titleFont: "serif", titleColor: "#f2c4c4", titleSize: "lg", headerBranding: true, allowDownload: false, social: { website: "", instagram: " instagram.com/photographer ", facebook: "" } };
    expect(buildSettingsPatch(v, gallery())).toEqual({
      name: "Public test (edited)", visibility: "public", website: "", instagram: "instagram.com/photographer", facebook: "", allowDownload: false, disableDownloadAfterSubmit: false, description: "A description",
      eventDate: "2026-06-15", location: "Santorini, Greece", expiresAt: "", bookLink: "", bookEnabled: false, titleFont: "serif", titleColor: "#f2c4c4", titleSize: "lg", headerBranding: "photographer",
    });
  });

  it("the stored password is never re-sent (it would log every visitor out), a public gallery sends none, a new one is sent", () => {
    const same = settingsFrom(privateGallery()); // password field still holds the stored one
    expect(buildSettingsPatch(same, privateGallery())).not.toHaveProperty("password");
    expect(buildSettingsPatch({ ...same, password: "" }, privateGallery())).not.toHaveProperty("password");
    expect(buildSettingsPatch({ ...same, visibility: "public", password: "anything" }, privateGallery())).not.toHaveProperty("password");
    expect(buildSettingsPatch({ ...same, password: "changed" }, privateGallery()).password).toBe("changed");
  });

  it("Save is refused before anything is sent: private needs a password, and making a private gallery public needs the confirmation", () => {
    expect(settingsProblem({ ...settingsFrom(gallery()), visibility: "private", password: "" }, gallery())).toBe("passwordRequired");
    expect(settingsProblem({ ...settingsFrom(gallery()), visibility: "private", password: "pw" }, gallery())).toBeNull();
    expect(settingsProblem({ ...settingsFrom(privateGallery()), visibility: "private", password: "" }, privateGallery())).toBeNull(); // keeps its own
    expect(settingsProblem({ ...settingsFrom(privateGallery()), visibility: "public" }, privateGallery())).toBe("confirmMakePublic");
    expect(settingsProblem({ ...settingsFrom(privateGallery()), visibility: "public", confirmMakePublic: true }, privateGallery())).toBeNull();
    expect(settingsProblem(settingsFrom(gallery()), gallery())).toBeNull();
  });

  it("after a save the server's password and visibility come back, the confirmation resets, and the Drive link keeps showing the folder", () => {
    const v = { ...settingsFrom(privateGallery()), confirmMakePublic: true, name: "kept" };
    expect(settingsAfterSave(v, { password: null, visibility: "public" })).toMatchObject({ name: "kept", driveUrl: "https://drive.google.com/drive/folders/FOLDER1", password: "", visibility: "public", confirmMakePublic: false });
    expect(settingsAfterSave(v, { password: "pw", visibility: "private" })).toMatchObject({ password: "pw", visibility: "private" });
    expect(settingsAfterSave(v, {})).toMatchObject({ password: "", visibility: "public" });
    // The Drive link never goes blank after a save: it keeps the value, or follows the folder the server returns.
    expect(settingsAfterSave(v, { folderId: "FOLDER2" }).driveUrl).toBe("https://drive.google.com/drive/folders/FOLDER2");
  });

  it("the card's 'new favourites' marker: only when there is something, and it changed after the photographer last looked", () => {
    const g = { selectionCount: 2, selectionUpdatedAt: 100, selectionSubmittedAt: 200 };
    expect(hasNewSelections(g, 0)).toBe(true);
    expect(hasNewSelections(g, 199)).toBe(true);
    expect(hasNewSelections(g, 200)).toBe(false);
    expect(hasNewSelections({ selectionCount: 0, selectionUpdatedAt: 100 }, 0)).toBe(false); // nothing selected, nothing sent
    expect(hasNewSelections({ selectionSubmittedAt: 50 }, 10)).toBe(true); // a submission alone counts
    expect(hasNewSelections({}, 0)).toBe(false);
    expect(selectionSeenAt(g, 150)).toBe(200); // never earlier than the latest change
    expect(selectionSeenAt(g, 500)).toBe(500);
  });

  it("the gallery's public address", () => {
    expect(galleryUrl({ slug: "pubtest" })).toMatch(/\/gallery\/pubtest$/);
  });
});
