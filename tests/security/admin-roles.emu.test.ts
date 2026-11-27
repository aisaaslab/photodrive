/** S7-02 and S7-03 against the real Auth and Firestore emulators: a second administrator by claim, revocation, and the audit trail. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { changeAdminRole } = await import("@/lib/server/admin-roles");
const { requireAdmin } = await import("@/lib/server/auth");
const { GET: session } = await import("@/app/api/admin/session/route");
const { POST: createPlan } = await import("@/app/api/admin/plans/route");
const { PATCH: patchPlan, DELETE: deletePlan } = await import("@/app/api/admin/plans/[id]/route");
const { POST: promoCreate } = await import("@/app/api/admin/promo-codes/route");
const { POST: subscription } = await import("@/app/api/admin/subscription/route");
const { PATCH: editGallery, DELETE: deleteGallery } = await import("@/app/api/admin/galleries/[id]/route");
const { POST: createUser } = await import("@/app/api/admin/users/route");
const { DELETE: deleteUser } = await import("@/app/api/admin/users/[uid]/route");
const { DELETE: deleteMessage } = await import("@/app/api/admin/messages/[id]/route");

const AUTH = () => process.env.FIREBASE_AUTH_EMULATOR_HOST!;
async function signUp(email: string): Promise<{ uid: string; idToken: string }> {
  const r = await fetch(`http://${AUTH()}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "test-password-1", returnSecureToken: true }),
  });
  const j = await r.json();
  return { uid: j.localId, idToken: j.idToken };
}
async function signIn(email: string): Promise<string> {
  const r = await fetch(`http://${AUTH()}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "test-password-1", returnSecureToken: true }),
  });
  return (await r.json()).idToken;
}
const req = (token: string, url = "http://localhost/api/admin/session", init: ConstructorParameters<typeof NextRequest>[1] = {}) =>
  new NextRequest(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) } });
const auditEntries = async () => (await testDb().collection("audit_log").get()).docs.map((d) => d.data()).sort((a, b) => a.at - b.at);

beforeEach(async () => {
  await clearEmulators();
  vi.unstubAllEnvs();
  vi.stubEnv("ADMIN_UID", "bootstrap-admin");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

describe("a second administrator by custom claim (S7-02)", () => {
  it("a normal user is 403; after a grant and a fresh sign-in they are an administrator; a revoke ends it at once", async () => {
    const { idToken: plainToken } = await signUp("second@example.com");
    expect((await session(req(plainToken))).status).toBe(403);

    const dry = await changeAdminRole(testAuth(), "second@example.com", "grant", { apply: false, actor: "script:test" });
    expect(dry).toMatchObject({ wasAdmin: false, willBeAdmin: true, applied: false });
    expect((await testAuth().getUserByEmail("second@example.com")).customClaims?.admin).toBeUndefined(); // dry run wrote nothing

    const done = await changeAdminRole(testAuth(), "second@example.com", "grant", { apply: true, actor: "script:test" });
    expect(done.applied).toBe(true);
    // The old token predates the grant: it carries no claim, so it does not work as an administrator's (the emulator also invalidates it: 401).
    expect((await session(req(plainToken))).status).not.toBe(200);
    const adminToken = await signIn("second@example.com");
    expect((await session(req(adminToken))).status).toBe(200);

    // Firebase revocation has one-second resolution (a token issued in the same second as the revoke is not yet "before" it); real revokes come later.
    await new Promise((r) => setTimeout(r, 1100));
    const revoked = await changeAdminRole(testAuth(), "second@example.com", "revoke", { apply: true, actor: "script:test" });
    expect(revoked).toMatchObject({ wasAdmin: true, willBeAdmin: false, applied: true });
    // The same token still says admin: true, but the revocation list wins, immediately (the unit tests pin that the check is made).
    expect((await session(req(adminToken))).status).not.toBe(200);
    // And a fresh sign-in carries no claim.
    expect((await session(req(await signIn("second@example.com")))).status).toBe(403);
  });

  it("granting twice or revoking a non-admin changes nothing and writes no audit entry", async () => {
    await signUp("x@example.com");
    expect((await changeAdminRole(testAuth(), "x@example.com", "revoke", { apply: true, actor: "s" })).applied).toBe(false);
    await changeAdminRole(testAuth(), "x@example.com", "grant", { apply: true, actor: "s" });
    expect((await changeAdminRole(testAuth(), "x@example.com", "grant", { apply: true, actor: "s" })).applied).toBe(false);
    expect((await auditEntries()).map((e) => e.action)).toEqual(["admin.grant"]);
  });

  it("works with a uid as well as an e-mail, keeps the user's other claims, and records who changed what", async () => {
    const { uid } = await signUp("keep@example.com");
    await testAuth().setCustomUserClaims(uid, { plan: "pro" });
    await changeAdminRole(testAuth(), uid, "grant", { apply: true, actor: "script:set-admin-claim" });
    expect((await testAuth().getUser(uid)).customClaims).toEqual({ plan: "pro", admin: true });
    await changeAdminRole(testAuth(), uid, "revoke", { apply: true, actor: "script:set-admin-claim" });
    expect((await testAuth().getUser(uid)).customClaims).toEqual({ plan: "pro" });
    const log = await auditEntries();
    expect(log.map((e) => [e.action, e.actorUid, e.targetType, e.targetId])).toEqual([
      ["admin.grant", "script:set-admin-claim", "admin", uid], ["admin.revoke", "script:set-admin-claim", "admin", uid],
    ]);
    expect(log[0]).toMatchObject({ before: { admin: false }, after: { admin: true }, note: "keep@example.com" });
  });

  it("the bootstrap administrator needs no claim", async () => {
    const { idToken } = await signUp("boss@example.com");
    const decoded = await testAuth().verifyIdToken(idToken);
    vi.stubEnv("ADMIN_UID", decoded.uid);
    expect((await requireAdmin(req(idToken))).ok).toBe(true);
  });
});

describe("every administrator action is audited (S7-03)", () => {
  async function asAdmin() {
    await signUp("auditor@example.com");
    await changeAdminRole(testAuth(), "auditor@example.com", "grant", { apply: true, actor: "setup" });
    await testDb().collection("audit_log").get().then((s) => Promise.all(s.docs.map((d) => d.ref.delete())));
    return signIn("auditor@example.com");
  }
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("plans: create, toggle, update and delete each leave an entry with the actor, the target and before/after", async () => {
    const token = await asAdmin();
    const uid = (await testAuth().getUserByEmail("auditor@example.com")).uid;
    const created = await (await createPlan(req(token, "http://l/api/admin/plans", { method: "POST", body: JSON.stringify({ name: "Pro", interval: "yearly", price: 99 }) }))).json();
    await patchPlan(req(token, "http://l/x", { method: "PATCH", body: JSON.stringify({ active: false }) }), ctx(created.id));
    await patchPlan(req(token, "http://l/x", { method: "PATCH", body: JSON.stringify({ name: "Pro", interval: "yearly", price: 120 }) }), ctx(created.id));
    await deletePlan(req(token, "http://l/x", { method: "DELETE" }), ctx(created.id));
    const log = await auditEntries();
    expect(log.map((e) => e.action)).toEqual(["plan.create", "plan.toggle", "plan.update", "plan.delete"]);
    expect(log.every((e) => e.actorUid === uid && e.targetType === "plan" && e.targetId === created.id)).toBe(true);
    expect(log[0].after).toMatchObject({ name: "Pro", priceCents: 9900 });
    expect(log[1]).toMatchObject({ before: { active: true }, after: { active: false } });
    expect(log[2]).toMatchObject({ before: { priceCents: 9900 }, after: { priceCents: 12000 } });
    expect(log[3].before).toMatchObject({ name: "Pro" });
  });

  it("subscription changes record the user's access before and after; promo codes and galleries are audited too, without secrets", async () => {
    const token = await asAdmin();
    await seedUser("customer", { subscriptionStatus: "none", subscriptionExpiresAt: 0 });
    await subscription(req(token, "http://l/x", { method: "POST", body: JSON.stringify({ uid: "customer", action: "grant_lifetime" }) }));
    await promoCreate(req(token, "http://l/x", { method: "POST", body: JSON.stringify({ code: "FREEYEAR", accessDays: 365 }) }));
    await testDb().collection("galleries").doc("g1").set({ photographerId: "customer", name: "G", slug: "s1", folderId: "f", createdAt: 1, passwordHash: "secret-hash", visibility: "public" });
    await editGallery(req(token, "http://l/x", { method: "PATCH", body: JSON.stringify({ name: "Renamed" }) }), ctx("g1"));
    await deleteGallery(req(token, "http://l/x", { method: "DELETE" }), ctx("g1"));
    const log = await auditEntries();
    expect(log.map((e) => e.action)).toEqual(["subscription.grant_lifetime", "promo.create", "gallery.update", "gallery.delete"]);
    expect(log[0]).toMatchObject({ targetType: "user", targetId: "customer", before: { subscriptionStatus: "none" }, after: { subscriptionStatus: "active", compGranted: true } });
    expect(log[1]).toMatchObject({ targetType: "promoCode", targetId: "FREEYEAR", after: { accessDays: 365 } });
    expect(log[2]).toMatchObject({ before: { name: "G" }, after: { name: "Renamed" } });
    expect(JSON.stringify(log)).not.toContain("secret-hash");
  });

  it("creating and deleting a user, and deleting a support message, are audited (without the message's personal data)", async () => {
    const token = await asAdmin();
    const created = await (await createUser(req(token, "http://l/api/admin/users", { method: "POST", body: JSON.stringify({ email: "new@example.com", displayName: "New User" }) }))).json();
    expect(created.user?.uid).toBeTruthy();
    await deleteUser(req(token, "http://l/x", { method: "DELETE" }), { params: Promise.resolve({ uid: created.user.uid }) });
    await testDb().collection("contactMessages").doc("m1").set({ name: "Visitor", email: "visitor@example.com", message: "hello" });
    await deleteMessage(req(token, "http://l/x", { method: "DELETE" }), ctx("m1"));
    const log = await auditEntries();
    expect(log.map((e) => [e.action, e.targetType])).toEqual([["user.create", "user"], ["user.delete", "user"], ["message.delete", "message"]]);
    expect(log[0]).toMatchObject({ targetId: created.user.uid, after: { email: "new@example.com" } });
    expect(JSON.stringify(log[2])).not.toContain("visitor@example.com");
  });

  it("a refused request (not an administrator) writes nothing", async () => {
    const { idToken } = await signUp("plain@example.com");
    const res = await createPlan(req(idToken, "http://l/api/admin/plans", { method: "POST", body: JSON.stringify({ name: "X", interval: "yearly", price: 1 }) }));
    expect(res.status).toBe(403);
    expect(await auditEntries()).toEqual([]);
  });
});
