import { describe, expect, it } from "vitest";
import { createGalleryBody, initialValues, isValidDriveUrl, pendingGalleryOf, type NewGalleryValues } from "@/lib/gallery/new-gallery";

const base: NewGalleryValues = {
  name: "Wedding", driveUrl: "https://drive.google.com/drive/folders/abc", password: "", visibility: "public",
  social: { website: "", instagram: "", facebook: "" }, socialOn: { website: false, instagram: false, facebook: false },
  description: "", eventDate: "", location: "", expiresAt: "",
};
const json = (v: unknown) => JSON.parse(JSON.stringify(v));

describe("new gallery form rules (S5-09)", () => {
  it("accepts the Drive folder link shapes and nothing else", () => {
    for (const ok of ["https://drive.google.com/drive/folders/1AbC", "https://drive.google.com/drive/u/0/folders/x".replace("u/0/", ""), "https://drive.google.com/open?id=1AbC", "https://drive.google.com/folderview?id=1AbC"]) {
      expect(isValidDriveUrl(ok), ok).toBe(true);
    }
    for (const bad of ["", "not a url", "https://example.com/drive/folders/1", "https://drive.google.com/file/d/1AbC", "https://docs.google.com/document/d/1"]) {
      expect(isValidDriveUrl(bad), bad).toBe(false);
    }
  });

  it("a public gallery sends only what was filled in, and never a password", () => {
    expect(json(createGalleryBody({ ...base, password: "left-over", description: "  About  ", location: " Athens ", eventDate: "2026-06-15" }))).toEqual({
      name: "Wedding", driveUrl: base.driveUrl, visibility: "public", description: "About", location: "Athens", eventDate: "2026-06-15",
    });
    expect(json(createGalleryBody(base))).toEqual({ name: "Wedding", driveUrl: base.driveUrl, visibility: "public" });
  });

  it("an expiry date is sent only when one was chosen (S9-05), and survives the payment round trip", () => {
    expect(json(createGalleryBody({ ...base, expiresAt: "2027-03-01" })).expiresAt).toBe("2027-03-01");
    expect("expiresAt" in json(createGalleryBody(base))).toBe(false);
    expect(initialValues(pendingGalleryOf({ ...base, expiresAt: "2027-03-01" })).expiresAt).toBe("2027-03-01");
    expect(initialValues(undefined).expiresAt).toBe("");
  });

  it("a private gallery sends its password", () => {
    expect(json(createGalleryBody({ ...base, visibility: "private", password: "secret" })).password).toBe("secret");
  });

  it("a link row is sent only when switched on, trimmed, and not when blank", () => {
    const v = { ...base, social: { website: " https://x.com ", instagram: "https://i.com", facebook: "   " }, socialOn: { website: true, instagram: false, facebook: true } };
    expect(json(createGalleryBody(v))).toEqual({ name: "Wedding", driveUrl: base.driveUrl, visibility: "public", website: "https://x.com" });
  });

  it("what is kept while the visitor pays: everything typed, with switched-off link rows cleared", () => {
    const v = { ...base, visibility: "private" as const, password: "pw", social: { website: "https://x.com", instagram: "https://i.com", facebook: "" }, socialOn: { website: false, instagram: true, facebook: false }, description: "d", eventDate: "2026-01-02", location: "l", expiresAt: "" };
    expect(pendingGalleryOf(v)).toEqual({ name: "Wedding", driveUrl: base.driveUrl, password: "pw", visibility: "private", website: "", instagram: "https://i.com", facebook: "", description: "d", eventDate: "2026-01-02", location: "l", expiresAt: "" });
  });

  it("a restored form starts from what was kept; link rows with a value are switched on; an old form's visibility follows its password", () => {
    const kept = pendingGalleryOf({ ...base, visibility: "private", password: "pw", social: { website: "", instagram: "https://i.com", facebook: "" }, socialOn: { website: false, instagram: true, facebook: false } });
    const v = initialValues(kept);
    expect(v).toMatchObject({ name: "Wedding", password: "pw", visibility: "private", social: { instagram: "https://i.com" }, socialOn: { website: false, instagram: true, facebook: false } });
    expect(initialValues({ name: "x", driveUrl: "y", password: "old" }).visibility).toBe("private"); // saved before visibility existed, with a password
    expect(initialValues({ name: "x", driveUrl: "y", password: "" }).visibility).toBe("public");
    expect(initialValues(undefined)).toMatchObject({ name: "", driveUrl: "", password: "", visibility: "public" });
  });
});
