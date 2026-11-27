/** S7-05 against the emulators: a paged, searchable, filterable user list with no 1,000-user ceiling, a detail view, and the emailLower backfill. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { clearEmulators, testAuth, testDb } from "../helpers/db";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { listUsersPage, decodeCursor } = await import("@/lib/server/repos/admin-users");
const { GET: listRoute } = await import("@/app/api/admin/users/route");
const { GET: detailRoute } = await import("@/app/api/admin/users/[uid]/route");
const { planEmailLower, readEmailProfiles, applyEmailLower } = await import("@/lib/server/migrations/backfill-email-lower");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const AUTH = () => process.env.FIREBASE_AUTH_EMULATOR_HOST!;

async function adminToken(): Promise<string> {
  const r = await fetch(`http://${AUTH()}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "boss@example.com", password: "test-password-1", returnSecureToken: true }),
  });
  const j = await r.json();
  vi.stubEnv("ADMIN_UID", j.localId);
  return j.idToken;
}
const get = (path: string, token: string) => new NextRequest(`http://localhost${path}`, { headers: { authorization: `Bearer ${token}` } });

async function seedMany(n: number) {
  const db = testDb();
  for (let i = 0; i < n; i += 400) {
    const batch = db.batch();
    for (let j = i; j < Math.min(n, i + 400); j++) {
      const email = `User${String(j).padStart(5, "0")}@Example.com`;
      batch.set(db.collection("users").doc(`u${String(j).padStart(5, "0")}`), { uid: `u${j}`, email, emailLower: email.toLowerCase(), name: `User ${j}`, createdAt: Timestamp.fromMillis(NOW - j * 1000) });
    }
    await batch.commit();
  }
}

beforeEach(async () => {
  await clearEmulators();
  vi.unstubAllEnvs();
});

describe("paging", () => {
  it("walks 1,500 users page by page: every one exactly once, in order, no ceiling", async () => {
    await seedMany(1500);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await listUsersPage({ cursor, limit: 50 }, testDb(), NOW);
      expect(page.total).toBe(1500);
      expect(page.needsBackfill).toBe(0);
      seen.push(...page.users.map((u) => u.uid));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(30);
    expect(seen).toHaveLength(1500);
    expect(new Set(seen).size).toBe(1500);
    expect(seen).toEqual([...seen].sort());
  }, 60000);

  it("a page costs one Auth lookup, whatever the number of users", async () => {
    await seedMany(300);
    const spy = vi.spyOn(testAuth(), "getUsers");
    await listUsersPage({ limit: 25 }, testDb(), NOW);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toHaveLength(25);
  });

  it("clamps the page size and ignores nonsense", async () => {
    await seedMany(60);
    expect((await listUsersPage({ limit: 500 }, testDb(), NOW)).users).toHaveLength(50);
    expect((await listUsersPage({ limit: 0 }, testDb(), NOW)).users).toHaveLength(1);
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(Buffer.from('{"k":1}').toString("base64url"))).toBeNull();
  });
});

describe("search", () => {
  it("finds by e-mail prefix, ignoring case, and pages through the matches", async () => {
    await seedMany(120);
    const first = await listUsersPage({ q: "USER0001", limit: 5 }, testDb(), NOW);
    expect(first.users.map((u) => u.uid)).toEqual(["u00010", "u00011", "u00012", "u00013", "u00014"]);
    expect(first.nextCursor).not.toBeNull();
    const all: string[] = [];
    let cursor: string | null = null;
    do {
      const p = await listUsersPage({ q: "user0001", cursor, limit: 4 }, testDb(), NOW);
      all.push(...p.users.map((u) => u.uid)); cursor = p.nextCursor;
    } while (cursor);
    expect(all).toHaveLength(10); // u00010 .. u00019
    expect((await listUsersPage({ q: "nobody@", limit: 5 }, testDb(), NOW)).users).toEqual([]);
  });
});

describe("filters", () => {
  async function seedAccess() {
    const db = testDb();
    const mk = (id: string, extra: Record<string, unknown>) => db.collection("users").doc(id).set({ email: `${id}@x.com`, emailLower: `${id}@x.com`, name: id, ...extra });
    await mk("a-active", { subscriptionStatus: "active", subscriptionExpiresAt: NOW + 90 * DAY, planInterval: "yearly" });
    await mk("b-soon", { subscriptionStatus: "active", subscriptionExpiresAt: NOW + 5 * DAY });
    await mk("c-lifetime", { subscriptionStatus: "active", subscriptionExpiresAt: 32503680000000, compGranted: true });
    await mk("d-lapsed", { subscriptionStatus: "active", subscriptionExpiresAt: NOW - 3 * DAY });
    await mk("e-revoked", { subscriptionStatus: "none", subscriptionExpiresAt: 0 });
    await mk("f-cancelled-future", { subscriptionStatus: "canceled", subscriptionExpiresAt: NOW + 3 * DAY });
    await mk("g-never", {});
  }
  const ids = async (filter: "all" | "active" | "expiring" | "lapsed" | "comped", q = "") =>
    (await listUsersPage({ filter, q, limit: 50 }, testDb(), NOW)).users.map((u) => u.uid);

  it("active, expiring, lapsed and comped each mean what the overview says", async () => {
    await seedAccess();
    expect(await ids("active")).toEqual(["b-soon", "a-active", "c-lifetime"]); // soonest end first
    expect(await ids("expiring")).toEqual(["b-soon"]); // lifetime is never "expiring"
    expect(await ids("lapsed")).toEqual(["d-lapsed", "f-cancelled-future"].filter((x) => x === "d-lapsed")); // revoked and never-subscribed are not lapsed
    expect(await ids("comped")).toEqual(["c-lifetime"]);
    expect((await ids("all"))).toHaveLength(7);
  });

  it("a filter chosen together with a search is applied to the matches", async () => {
    await seedAccess();
    expect(await ids("active", "b-")).toEqual(["b-soon"]);
    expect(await ids("lapsed", "b-")).toEqual([]);
    expect(await ids("active", "")).toHaveLength(3);
  });

  it("fills a page from a filtered search even when most matches are filtered out", async () => {
    const db = testDb();
    for (let i = 0; i < 250; i++) await db.collection("users").doc(`m${String(i).padStart(3, "0")}`).set({ email: `m${i}@x.com`, emailLower: `m${String(i).padStart(3, "0")}@x.com`, ...(i % 50 === 0 ? { compGranted: true } : {}) });
    const page = await listUsersPage({ q: "m", filter: "comped", limit: 5 }, testDb(), NOW);
    expect(page.users.map((u) => u.uid)).toEqual(["m000", "m050", "m100", "m150", "m200"]);
  });
});

describe("the row", () => {
  it("combines the profile, Auth, galleries and payments", async () => {
    const db = testDb();
    await testAuth().createUser({ uid: "u1", email: "Ann@Example.com", displayName: "Ann Google", photoURL: "https://example.com/a.png" });
    await db.collection("users").doc("u1").set({ email: "Ann@Example.com", emailLower: "ann@example.com", name: "Ann Edited", subscriptionStatus: "active", subscriptionExpiresAt: NOW + 10 * DAY, planName: "Pro", planInterval: "monthly" });
    await db.collection("galleries").doc("g1").set({ photographerId: "u1", name: "Wedding", slug: "wedding", createdAt: NOW - 5 * DAY });
    await db.collection("galleries").doc("g2").set({ photographerId: "u1", name: "Party", slug: "party", createdAt: NOW - 1 * DAY });
    await db.collection("galleries").doc("g3").set({ photographerId: "someone-else", createdAt: NOW });
    await db.collection("payments").doc("p1").set({ uid: "u1", amountTotal: 1900, currency: "usd", status: "refunded", activatedAt: NOW - 2 * DAY });
    const { users } = await listUsersPage({}, db, NOW);
    expect(users[0]).toMatchObject({
      uid: "u1", email: "ann@example.com", displayName: "Ann Edited", photoURL: "https://example.com/a.png", galleryCount: 2, lastGalleryAt: NOW - 1 * DAY,
      subscriptionActive: true, planName: "Pro", accessSource: "paid", lastPaymentCents: 1900, lastPaymentCurrency: "usd",
    });
    expect(users[0].paymentFlags.map((f) => f.status)).toEqual(["refunded"]);
  });

  it("falls back to the profile when there is no Auth account", async () => {
    await testDb().collection("users").doc("ghost").set({ email: "g@x.com", emailLower: "g@x.com", name: "Ghost", createdAt: Timestamp.fromMillis(NOW - DAY) });
    const { users } = await listUsersPage({}, testDb(), NOW);
    expect(users[0]).toMatchObject({ uid: "ghost", email: "g@x.com", displayName: "Ghost", lastSignIn: null, createdAt: NOW - DAY });
  });
});

describe("profiles that are not searchable yet", () => {
  it("are counted, so the screen can say so, and are found once the backfill has run", async () => {
    const db = testDb();
    await db.collection("users").doc("old").set({ email: "Old@Example.COM", name: "Old" });
    await db.collection("users").doc("new").set({ email: "new@example.com", emailLower: "new@example.com" });
    await db.collection("users").doc("none").set({ name: "No e-mail" });
    const before = await listUsersPage({}, db, NOW);
    expect(before.total).toBe(3);
    expect(before.needsBackfill).toBe(2);
    expect(before.users.map((u) => u.uid)).toEqual(["new"]);

    const plan = planEmailLower(await readEmailProfiles(db));
    expect(plan.changes).toEqual([{ uid: "old", email: "Old@Example.COM", from: null, to: "old@example.com" }]);
    expect(plan.noEmail).toEqual(["none"]);
    expect(plan.unchanged).toBe(1);
    expect((await db.collection("users").doc("old").get()).get("emailLower")).toBeUndefined(); // planning wrote nothing

    expect(await applyEmailLower(db, plan.changes)).toBe(1);
    expect(planEmailLower(await readEmailProfiles(db)).changes).toEqual([]); // re-running does nothing more
    const after = await listUsersPage({ q: "OLD@" }, db, NOW);
    expect(after.users.map((u) => u.uid)).toEqual(["old"]);
    expect(after.needsBackfill).toBe(1); // only the profile with no e-mail at all
  });
});

describe("the endpoints", () => {
  it("refuse anyone who is not an administrator", async () => {
    expect((await listRoute(new NextRequest("http://localhost/api/admin/users"))).status).toBe(401);
    const r = await fetch(`http://${AUTH()}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "plain@example.com", password: "test-password-1", returnSecureToken: true }) });
    const { idToken } = await r.json();
    expect((await listRoute(get("/api/admin/users", idToken))).status).toBe(403);
    expect((await detailRoute(get("/api/admin/users/x", idToken), { params: Promise.resolve({ uid: "x" }) })).status).toBe(403);
  });

  it("list: validates the filter and the cursor, and returns the page", async () => {
    const token = await adminToken();
    await seedMany(30);
    expect((await listRoute(get("/api/admin/users?filter=bogus", token))).status).toBe(400);
    expect((await listRoute(get("/api/admin/users?cursor=zzz", token))).status).toBe(400);
    const res = await listRoute(get("/api/admin/users?limit=10", token));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.users).toHaveLength(10);
    expect(body.total).toBe(30);
    expect(typeof body.nextCursor).toBe("string");
    const next = await (await listRoute(get(`/api/admin/users?limit=10&cursor=${encodeURIComponent(body.nextCursor)}`, token))).json();
    expect(next.users[0].uid).toBe("u00010");
  });

  it("detail: payments, galleries and what administrators did to this user; 404 for a stranger", async () => {
    const token = await adminToken();
    const db = testDb();
    await testAuth().createUser({ uid: "u1", email: "ann@example.com" });
    await db.collection("users").doc("u1").set({ email: "ann@example.com", emailLower: "ann@example.com", name: "Ann" });
    await db.collection("payments").doc("p1").set({ uid: "u1", amountTotal: 1900, currency: "usd", activatedAt: NOW - DAY, promoCode: null });
    await db.collection("galleries").doc("g1").set({ photographerId: "u1", name: "Wedding", slug: "wedding", createdAt: NOW - DAY, visibility: "private" });
    await db.collection("audit_log").doc("a1").set({ at: NOW - 1000, actorUid: "boss", action: "subscription.grant_year", targetType: "user", targetId: "u1", note: null });
    await db.collection("audit_log").doc("a2").set({ at: NOW, actorUid: "boss", action: "subscription.revoke", targetType: "user", targetId: "u1" });
    await db.collection("audit_log").doc("a3").set({ at: NOW, actorUid: "boss", action: "plan.update", targetType: "plan", targetId: "other" });
    const res = await detailRoute(get("/api/admin/users/u1", token), { params: Promise.resolve({ uid: "u1" }) });
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.row.uid).toBe("u1");
    expect(d.payments.map((p: { id: string }) => p.id)).toEqual(["p1"]);
    expect(d.galleries).toEqual([{ id: "g1", name: "Wedding", slug: "wedding", folderId: "", createdAt: NOW - DAY, visibility: "private", hasPassword: false, disabled: false, website: null, instagram: null, facebook: null }]);
    expect(d.activity.map((a: { action: string }) => a.action)).toEqual(["subscription.revoke", "subscription.grant_year"]);
    expect(JSON.stringify(d)).not.toMatch(/"password"|passwordHash|passwordEnc|stripeCustomerId/);
    expect((await detailRoute(get("/api/admin/users/nope", token), { params: Promise.resolve({ uid: "nope" }) })).status).toBe(404);
  });
});
