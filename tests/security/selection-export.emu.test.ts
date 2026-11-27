/** S10-01: the owner-only selection export. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { GET } = await import("@/app/api/galleries/[id]/selection/export/route");

let asUid: string | null = "owner";
const call = (id: string, query = "") =>
  GET(new NextRequest(`http://localhost/api/galleries/${id}/selection/export${query}`, { headers: asUid ? { authorization: "Bearer t" } : {} }), { params: Promise.resolve({ id }) });

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.stubEnv("ADMIN_UID", "boss");
  asUid = "owner";
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => {
    if (!asUid) throw new Error("no token");
    return { uid: asUid };
  }) as never);
  await seedUser("owner", { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 86_400_000 });
  await testDb().collection("galleries").doc("g1").set({ photographerId: "owner", name: "G", folderId: "f", slug: "g", createdAt: 1 });
  await testDb().collection("gallery_selections").doc("g1").set({
    items: [{ id: "b", name: "IMG_10.jpg" }, { id: "a", name: "IMG_2.jpg" }],
  });
});

describe("GET /api/galleries/[id]/selection/export", () => {
  it("gives the owner exactly the selected file names", async () => {
    const res = await call("g1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.text()).toBe("IMG_2.jpg\nIMG_10.jpg");
  });

  it("csv and stripped extensions", async () => {
    const res = await call("g1", "?format=csv&ext=strip");
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("selection.csv");
    expect(await res.text()).toBe("filename\r\nIMG_2\r\nIMG_10\r\n");
  });

  it("is empty for a gallery nobody has picked from", async () => {
    await testDb().collection("gallery_selections").doc("g1").delete();
    expect(await (await call("g1")).text()).toBe("");
  });

  it("a different signed-in user gets 404, the same as for a missing gallery", async () => {
    asUid = "other";
    const res = await call("g1");
    expect(res.status).toBe(404);
    expect((await call("nope")).status).toBe(404);
    expect(await res.text()).not.toContain("IMG_");
  });

  it("an anonymous visitor gets 404", async () => {
    asUid = null;
    expect((await call("g1")).status).toBe(404);
  });
});
