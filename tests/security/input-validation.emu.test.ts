/** S3-09: the routes answer one consistent 400 and never crash on bad input. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
vi.mock("@/lib/firebase/admin-guard", async (orig) => ({
  ...(await orig<typeof import("@/lib/firebase/admin-guard")>()),
  getUidFromRequest: async () => asUid,
}));

const { POST: contact } = await import("@/app/api/contact/route");
const { POST: submit } = await import("@/app/api/galleries/[id]/selection/submit/route");
const { POST: toggle } = await import("@/app/api/galleries/[id]/selection/route");
const { POST: create } = await import("@/app/api/galleries/route");
const { PATCH: edit } = await import("@/app/api/galleries/[id]/route");
const { POST: adminSub } = await import("@/app/api/admin/subscription/route");

let asUid = "owner";
let n = 0;
const rawReq = (url: string, method: string, raw: string | undefined) =>
  new NextRequest(url, { method, headers: { "content-type": "application/json", authorization: "Bearer t", "x-real-ip": `203.0.113.${++n}` }, body: raw });
const json = (v: unknown) => JSON.stringify(v);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const BAD_BODIES: [string, string | undefined][] = [
  ["no body", undefined],
  ["broken JSON", "{nope"],
  ["null", "null"],
  ["array", "[1,2]"],
  ["number", "5"],
  ["string", '"text"'],
];

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("ADMIN_UID", "boss");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  asUid = "owner";
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => ({ uid: asUid })) as never);
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  await seedUser("owner", { subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 86_400_000 });
  await testDb().collection("galleries").doc("g1").set({ photographerId: "owner", name: "G", slug: "s1", folderId: "f", createdAt: 1 });
});

describe("bad bodies are a 400, never a 500", () => {
  for (const [label, raw] of BAD_BODIES) {
    it(label, async () => {
      const results = {
        contact: await contact(rawReq("http://localhost/api/contact", "POST", raw)),
        submit: await submit(rawReq("http://localhost/api/galleries/g1/selection/submit", "POST", raw), ctx("g1")),
        toggle: await toggle(rawReq("http://localhost/api/galleries/g1/selection", "POST", raw), ctx("g1")),
        create: await create(rawReq("http://localhost/api/galleries", "POST", raw)),
        edit: await edit(rawReq("http://localhost/api/galleries/g1", "PATCH", raw), ctx("g1")),
      };
      for (const [route, res] of Object.entries(results)) {
        expect(res.status, route).toBe(400);
        expect(await res.json(), route).toMatchObject({ error: expect.any(String) });
      }
      asUid = "boss";
      expect((await adminSub(rawReq("http://localhost/api/admin/subscription", "POST", raw))).status, "admin subscription").toBe(400);
    });
  }
});

describe("typed fields", () => {
  it("a gallery name that is not text is refused instead of being stored as an object", async () => {
    const res = await create(rawReq("http://localhost/api/galleries", "POST", json({ name: { $evil: 1 }, driveUrl: "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345" })));
    expect(res.status).toBe(400);
    expect((await res.json()).issues[0].path).toBe("name");
    expect((await testDb().collection("galleries").get()).size).toBe(1); // only the fixture
    expect((await edit(rawReq("http://localhost/api/galleries/g1", "PATCH", json({ name: ["x"] })), ctx("g1"))).status).toBe(400);
    expect((await testDb().collection("galleries").doc("g1").get()).data()!.name).toBe("G");
  });

  it("selection toggle checks the action and the item", async () => {
    const t = (b: unknown) => toggle(rawReq("http://localhost/api/galleries/g1/selection", "POST", json(b)), ctx("g1"));
    expect((await t({ action: "add", item: { id: "f1", name: "a.jpg" } })).status).toBe(200);
    for (const bad of [{ action: "drop", item: { id: "f1" } }, { action: "add" }, { action: "add", item: { id: 5 } }]) {
      expect((await t(bad)).status, json(bad)).toBe(400);
    }
    expect((await testDb().collection("gallery_selections").doc("g1").get()).data()!.count).toBe(1);
  });

  it("admin subscription refuses ids that are not document ids and unknown actions", async () => {
    asUid = "boss";
    const a = (b: unknown) => adminSub(rawReq("http://localhost/api/admin/subscription", "POST", json(b)));
    for (const bad of [{ uid: "a/b", action: "revoke" }, { uid: 5, action: "revoke" }, { uid: "owner", action: "burn" }, { action: "revoke" }]) {
      expect((await a(bad)).status, json(bad)).toBe(400);
    }
    expect((await a({ uid: "owner", action: "grant_lifetime" })).status).toBe(200);
  });

  it("contact still gives its friendly messages for field problems and answers ok to the honeypot", async () => {
    const c = (b: unknown) => contact(rawReq("http://localhost/api/contact", "POST", json(b)));
    expect(await (await c({ name: "A", email: "a@b.co", message: "long enough message" })).json()).toEqual({ error: "Please enter your name." });
    expect(await (await c({ website: "http://spam" })).json()).toEqual({ ok: true });
  });
});
