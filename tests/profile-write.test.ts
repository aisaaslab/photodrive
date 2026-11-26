import { describe, expect, it } from "vitest";
import { buildProfileWrite } from "@/lib/firestore/profile-write";

const google = { email: "a@example.com", name: "Anna Google", photoURL: "https://lh3.googleusercontent.com/a" };
const NOW = "SERVER_TIMESTAMP";

describe("buildProfileWrite (S4-01)", () => {
  it("first sign-in: creates the profile with createdAt, name and photo", () => {
    expect(buildProfileWrite("u1", undefined, google, NOW)).toEqual({ uid: "u1", email: "a@example.com", createdAt: NOW, name: "Anna Google", photoURL: google.photoURL });
  });

  it("every later sign-in leaves createdAt out, so the sign-up date is never reset", () => {
    const stored = { createdAt: 12345, name: "Anna Google", photoURL: google.photoURL };
    expect(buildProfileWrite("u1", stored, google, NOW)).toEqual({ uid: "u1", email: "a@example.com" });
    expect("createdAt" in buildProfileWrite("u1", stored, google, NOW)).toBe(false);
  });

  it("a profile that somehow has no createdAt gets one, once", () => {
    expect(buildProfileWrite("u1", { name: "Anna" }, google, NOW).createdAt).toBe(NOW);
    expect(buildProfileWrite("u1", { name: "Anna", createdAt: null }, google, NOW).createdAt).toBe(NOW);
  });

  it("keeps edits made in Account settings: an existing name and avatar are not overwritten", () => {
    const stored = { createdAt: 1, name: "Anna Edited", photoURL: "https://example.com/custom.png" };
    const w = buildProfileWrite("u1", stored, google, NOW);
    expect(w).not.toHaveProperty("name");
    expect(w).not.toHaveProperty("photoURL");
  });

  it("fills a missing name or photo from Google", () => {
    const w = buildProfileWrite("u1", { createdAt: 1, name: "", photoURL: undefined }, google, NOW);
    expect(w).toMatchObject({ name: "Anna Google", photoURL: google.photoURL });
    expect(buildProfileWrite("u1", { createdAt: 1, name: "x" }, { ...google, photoURL: undefined }, NOW)).not.toHaveProperty("photoURL");
  });
});
