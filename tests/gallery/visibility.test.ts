import { describe, expect, it } from "vitest";
import {
  MAX_GALLERY_PASSWORD_LENGTH, galleryVisibility, isPrivate, planCreate, planUpdate,
} from "@/lib/gallery/visibility";

const HASH = "$2b$10$abcdefghijklmnopqrstuv";

describe("existing galleries are derived, so nothing changes for them", () => {
  it("a gallery with a password is private, one without is public", () => {
    expect(galleryVisibility({ passwordHash: HASH })).toBe("private");
    expect(galleryVisibility({})).toBe("public");
    expect(galleryVisibility({ passwordHash: null })).toBe("public");
    expect(galleryVisibility({ passwordHash: "" })).toBe("public");
  });

  it("an explicit visibility is honoured", () => {
    expect(galleryVisibility({ visibility: "private", passwordHash: HASH })).toBe("private");
    expect(galleryVisibility({ visibility: "public" })).toBe("public");
    expect(galleryVisibility({ visibility: "banana" })).toBe("public");
  });

  it("fails safe: a stored password always makes the gallery private, whatever the field says", () => {
    expect(isPrivate({ visibility: "public", passwordHash: HASH })).toBe(true);
    expect(isPrivate({ visibility: "private" })).toBe(true); // private is never served openly
    expect(isPrivate({})).toBe(false);
  });
});

describe("planCreate", () => {
  it("private requires a password", () => {
    expect(planCreate({ visibility: "private" })).toEqual({ ok: false, error: "A private gallery needs a password" });
    expect(planCreate({ visibility: "private", password: "" })).toMatchObject({ ok: false });
    expect(planCreate({ visibility: "private", password: null })).toMatchObject({ ok: false });
    expect(planCreate({ visibility: "private", password: "s3cret" })).toEqual({
      ok: true, visibility: "private", newPassword: "s3cret", clearPassword: false,
    });
  });

  it("public cannot have a password", () => {
    expect(planCreate({ visibility: "public", password: "s3cret" })).toEqual({ ok: false, error: "A public gallery cannot have a password" });
    expect(planCreate({ visibility: "public" })).toEqual({ ok: true, visibility: "public", newPassword: null, clearPassword: false });
    expect(planCreate({ visibility: "public", password: "" })).toMatchObject({ ok: true, visibility: "public" });
  });

  it("older clients that send no visibility keep working: a password means private, none means public", () => {
    expect(planCreate({ password: "pw" })).toMatchObject({ ok: true, visibility: "private", newPassword: "pw" });
    expect(planCreate({})).toMatchObject({ ok: true, visibility: "public", newPassword: null });
    expect(planCreate({ password: undefined })).toMatchObject({ ok: true, visibility: "public" });
  });

  it("keeps a password exactly as typed (spaces included)", () => {
    expect(planCreate({ visibility: "private", password: "  two words  " })).toMatchObject({ newPassword: "  two words  " });
  });

  it("rejects an unknown visibility, a non-string password and an over-long password", () => {
    expect(planCreate({ visibility: "secret" })).toEqual({ ok: false, error: "Invalid visibility" });
    expect(planCreate({ visibility: 1 })).toEqual({ ok: false, error: "Invalid visibility" });
    expect(planCreate({ visibility: "private", password: 123 })).toEqual({ ok: false, error: "Invalid password" });
    expect(planCreate({ visibility: "private", password: ["a"] })).toEqual({ ok: false, error: "Invalid password" });
    expect(planCreate({ visibility: "private", password: "x".repeat(MAX_GALLERY_PASSWORD_LENGTH) })).toMatchObject({ ok: true });
    expect(planCreate({ visibility: "private", password: "x".repeat(MAX_GALLERY_PASSWORD_LENGTH + 1) })).toMatchObject({ ok: false });
  });
});

describe("planUpdate", () => {
  const priv = { visibility: "private", passwordHash: HASH };
  const pub = { visibility: "public" };

  it("changing nothing keeps the gallery as it is", () => {
    expect(planUpdate(priv, {})).toEqual({ ok: true, visibility: "private", newPassword: null, clearPassword: false });
    expect(planUpdate(pub, {})).toEqual({ ok: true, visibility: "public", newPassword: null, clearPassword: false });
    expect(planUpdate({ passwordHash: HASH }, {})).toMatchObject({ visibility: "private" }); // legacy, derived
    expect(planUpdate({}, {})).toMatchObject({ visibility: "public" });
  });

  it("a private gallery can change its password and keeps it when none is sent", () => {
    expect(planUpdate(priv, { password: "new" })).toEqual({ ok: true, visibility: "private", newPassword: "new", clearPassword: false });
    expect(planUpdate(priv, { visibility: "private" })).toEqual({ ok: true, visibility: "private", newPassword: null, clearPassword: false });
    expect(planUpdate(priv, { visibility: "private", password: "" })).toMatchObject({ ok: true, newPassword: null });
  });

  it("switching public to private needs a new password", () => {
    expect(planUpdate(pub, { visibility: "private" })).toEqual({ ok: false, error: "A private gallery needs a password" });
    expect(planUpdate(pub, { visibility: "private", password: "" })).toMatchObject({ ok: false });
    expect(planUpdate(pub, { visibility: "private", password: "pw" })).toEqual({
      ok: true, visibility: "private", newPassword: "pw", clearPassword: false,
    });
  });

  it("switching private to public removes the password, and cannot also set one", () => {
    expect(planUpdate(priv, { visibility: "public" })).toEqual({ ok: true, visibility: "public", newPassword: null, clearPassword: true });
    expect(planUpdate(priv, { visibility: "public", password: "x" })).toEqual({ ok: false, error: "A public gallery cannot have a password" });
    // a public gallery has nothing to clear
    expect(planUpdate(pub, { visibility: "public" })).toMatchObject({ clearPassword: false });
  });

  it("a private gallery can never lose its password without becoming public", () => {
    const r = planUpdate(priv, { visibility: "private", removePassword: true });
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("switch it to public");
    expect(planUpdate(priv, { removePassword: false, visibility: "private" })).toMatchObject({ ok: true });
  });

  it("older clients: removePassword makes it public, a new password makes it private", () => {
    expect(planUpdate(priv, { removePassword: true })).toEqual({ ok: true, visibility: "public", newPassword: null, clearPassword: true });
    expect(planUpdate({ passwordHash: HASH }, { removePassword: true })).toMatchObject({ visibility: "public", clearPassword: true });
    expect(planUpdate(pub, { password: "pw" })).toEqual({ ok: true, visibility: "private", newPassword: "pw", clearPassword: false });
    expect(planUpdate({}, { password: "pw" })).toMatchObject({ visibility: "private" });
    expect(planUpdate(pub, { removePassword: true })).toMatchObject({ ok: true, visibility: "public", clearPassword: false });
  });

  it("rejects bad input", () => {
    expect(planUpdate(priv, { visibility: "hidden" })).toEqual({ ok: false, error: "Invalid visibility" });
    expect(planUpdate(priv, { password: 5 })).toEqual({ ok: false, error: "Invalid password" });
    expect(planUpdate(priv, { password: "x".repeat(MAX_GALLERY_PASSWORD_LENGTH + 1) })).toMatchObject({ ok: false });
  });

  it("never produces a private plan without a password source (the invariant)", () => {
    const currents = [{}, pub, priv, { passwordHash: HASH }, { visibility: "private" }];
    const inputs = [{}, { visibility: "private" }, { visibility: "public" }, { password: "p" }, { removePassword: true }, { visibility: "private", password: "p" }];
    for (const c of currents) {
      for (const i of inputs) {
        const r = planUpdate(c, i);
        if (r.ok && r.visibility === "private") {
          expect(r.newPassword !== null || !!(c as { passwordHash?: string }).passwordHash, JSON.stringify([c, i])).toBe(true);
        }
        if (r.ok && r.visibility === "public") expect(r.newPassword).toBeNull();
      }
    }
  });
});
