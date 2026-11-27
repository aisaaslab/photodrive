/** S8-02: the admin Support inbox API against the real Firestore and Auth emulators. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const list = await import("@/app/api/admin/messages/route");
const item = await import("@/app/api/admin/messages/[id]/route");

const NOW = Date.now();
const MIN = 60_000;
let token = "boss-token";
const call = (url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) =>
  new NextRequest(`http://localhost${url}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const listOf = async (q = "") => (await (await list.GET(call(`/api/admin/messages${q}`))).json()) as {
  messages: { id: string; state: string; account: { uid: string; email: string; active: boolean } | null; read: boolean; note: string | null }[];
  nextCursor: string | null; counts: { total: number; unread: number; open: number; resolved: number };
};
const ids = (r: { messages: { id: string }[] }) => r.messages.map((m) => m.id);
const patch = (id: string, body: unknown) => item.PATCH(call(`/api/admin/messages/${id}`, { method: "PATCH", body: JSON.stringify(body) }), ctx(id));
const doc = async (id: string) => (await testDb().collection("contactMessages").doc(id).get()).data();
const audit = async () => (await testDb().collection("audit_log").get()).docs.map((d) => d.data()).sort((a, b) => a.at - b.at);
const msg = (id: string, over: Record<string, unknown> = {}) =>
  testDb().collection("contactMessages").doc(id).set({ name: "Visitor", email: "visitor@example.com", subject: "Hello", message: "A question about my account please", createdAt: NOW - MIN, ipHash: "abc123", userAgent: "Mozilla", read: false, emailed: true, ...over });

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  token = "boss-token";
  vi.stubEnv("ADMIN_UID", "boss");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async (t: string) => {
    if (t === "boss-token") return { uid: "boss" };
    if (t === "user-token") return { uid: "u1" };
    throw new Error("bad token");
  }) as never);
  await seedUser("boss");
});

describe("who may use it", () => {
  it("only administrators: a customer gets 403 and a visitor 401, on every endpoint", async () => {
    await msg("m1");
    const calls = () => [list.GET(call("/api/admin/messages")), patch("m1", { read: true }), item.DELETE(call("/api/admin/messages/m1", { method: "DELETE" }), ctx("m1"))];
    token = "user-token";
    for (const r of await Promise.all(calls())) expect(r.status).toBe(403);
    token = "nope";
    for (const r of await Promise.all(calls())) expect(r.status).toBe(401);
    expect(await doc("m1")).toMatchObject({ read: false }); // nothing changed
  });
});

describe("the list", () => {
  it("newest first, never exposing the sender's IP hash or browser", async () => {
    await msg("old", { createdAt: NOW - 5 * MIN });
    await msg("new", { createdAt: NOW - MIN });
    const r = await listOf();
    expect(ids(r)).toEqual(["new", "old"]);
    expect(JSON.stringify(r)).not.toContain("abc123");
    expect(JSON.stringify(r)).not.toContain("Mozilla");
    expect(r.messages[0]).toMatchObject({ state: "unread", read: false, subject: "Hello" }); // `read` kept for the older inbox in Settings
  });

  it("matches each message to the customer account with that e-mail, including one that lacks the search index", async () => {
    await seedUser("u1", { name: "Maria", subscriptionStatus: "active", subscriptionExpiresAt: NOW + 5 * 86_400_000 }, "maria@example.com");
    await testDb().collection("users").doc("u1").update({ emailLower: FieldValue.delete() });
    await msg("m1", { email: "Maria@Example.com" });
    await msg("m2", { email: "stranger@example.com" });
    const r = await listOf();
    const by = Object.fromEntries(r.messages.map((m) => [m.id, m.account]));
    expect(by.m1).toMatchObject({ uid: "u1", email: "maria@example.com", active: true });
    expect(by.m2).toBeNull();
  });

  it("filters: unread, open (not resolved), resolved; and the counts for the chips", async () => {
    await msg("unread");
    await msg("read", { read: true });
    await msg("done", { read: true, status: "resolved", resolvedAt: NOW });
    await testDb().collection("contactMessages").doc("legacy").set({ name: "Old", email: "old@example.com", subject: "Old", message: "from before read and status existed", createdAt: NOW - 9 * MIN }); // no read, no status
    expect(ids(await listOf("?filter=unread")).sort()).toEqual(["legacy", "unread"]);
    expect(ids(await listOf("?filter=open")).sort()).toEqual(["legacy", "read", "unread"]);
    expect(ids(await listOf("?filter=resolved"))).toEqual(["done"]);
    expect((await listOf()).counts).toEqual({ total: 4, unread: 2, open: 3, resolved: 1 });
  });

  it("search needs every word, in the sender, e-mail, subject, message or note", async () => {
    await msg("a", { name: "Maria", subject: "Invoice question", message: "charged twice for the yearly plan" });
    await msg("b", { name: "Nikos", subject: "Hello", message: "how do I add a password", note: "sent the help article" });
    expect(ids(await listOf("?q=maria"))).toEqual(["a"]);
    expect(ids(await listOf("?q=charged%20yearly"))).toEqual(["a"]);
    expect(ids(await listOf("?q=PASSWORD"))).toEqual(["b"]);
    expect(ids(await listOf("?q=help%20article"))).toEqual(["b"]);
    expect(ids(await listOf("?q=charged%20password"))).toEqual([]);
    expect(ids(await listOf("?q=maria&filter=resolved"))).toEqual([]);
  });

  it("pages with a cursor: every message exactly once, newest first", async () => {
    for (let i = 0; i < 7; i++) await msg(`m${i}`, { createdAt: NOW - i * MIN });
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page = await listOf(`?limit=3${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...ids(page));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(["m0", "m1", "m2", "m3", "m4", "m5", "m6"]);
  });

  it("refuses an unknown filter and a bad cursor", async () => {
    expect((await list.GET(call("/api/admin/messages?filter=nope"))).status).toBe(400);
    expect((await list.GET(call("/api/admin/messages?cursor=garbage"))).status).toBe(400);
  });
});

describe("changing a message", () => {
  it("mark read and unread, each audited once; asking for what is already true changes nothing", async () => {
    await msg("m1");
    expect((await patch("m1", { read: true })).status).toBe(200);
    expect(await doc("m1")).toMatchObject({ read: true });
    await patch("m1", { read: true });
    await patch("m1", { read: false });
    expect((await audit()).map((a) => a.action)).toEqual(["message.mark_read", "message.mark_unread"]);
  });

  it("resolving marks it read, records who and when, and leaves an audit entry with the operator's note", async () => {
    await msg("m1");
    const res = await patch("m1", { status: "resolved", note: "answered by e-mail on Tuesday" });
    const body = await res.json();
    expect(body.message).toMatchObject({ state: "resolved", read: true, resolvedBy: "boss", note: "answered by e-mail on Tuesday" });
    expect(await doc("m1")).toMatchObject({ status: "resolved", read: true, resolvedBy: "boss" });
    const log = await audit();
    expect(log[0]).toMatchObject({ action: "message.resolve", targetType: "message", targetId: "m1", actorUid: "boss", note: "answered by e-mail on Tuesday" });
    expect(JSON.stringify(log)).not.toContain("visitor@example.com");
    expect(JSON.stringify(log)).not.toContain("A question about my account");
    await patch("m1", { status: "resolved" }); // already resolved: nothing more is recorded
    expect((await audit()).filter((a) => a.action === "message.resolve")).toHaveLength(1);
  });

  it("a resolved message cannot be marked unread; reopening keeps it read and is audited", async () => {
    await msg("m1");
    await patch("m1", { status: "resolved" });
    const refused = await patch("m1", { read: false });
    expect(refused.status).toBe(409);
    expect(await doc("m1")).toMatchObject({ status: "resolved", read: true });
    const reopened = await (await patch("m1", { status: "open" })).json();
    expect(reopened.message).toMatchObject({ state: "read" });
    expect((await doc("m1"))?.resolvedBy).toBeUndefined();
    expect((await audit()).map((a) => a.action)).toEqual(["message.resolve", "message.reopen"]);
  });

  it("an internal note is saved with who and when, updated, and cleared with an empty one", async () => {
    await msg("m1");
    await patch("m1", { note: "  customer is on the yearly plan  " });
    expect(await doc("m1")).toMatchObject({ note: "customer is on the yearly plan", noteBy: "boss" });
    await patch("m1", { note: "customer is on the yearly plan" }); // unchanged
    await patch("m1", { note: "refund agreed" });
    await patch("m1", { note: "   " });
    expect((await doc("m1"))?.note).toBeUndefined();
    expect((await audit()).map((a) => a.action)).toEqual(["message.note", "message.note", "message.note_cleared"]);
  });

  it("404 for a message that does not exist, and nothing is created by asking", async () => {
    expect((await patch("ghost", { read: true })).status).toBe(404);
    expect((await item.DELETE(call("/api/admin/messages/ghost", { method: "DELETE" }), ctx("ghost"))).status).toBe(404);
    expect((await testDb().collection("contactMessages").get()).size).toBe(0);
    expect(await audit()).toEqual([]);
  });

  it("refuses a body that changes nothing or is the wrong shape", async () => {
    await msg("m1");
    for (const bad of [{}, { read: "yes" }, { status: "closed" }, { note: "x".repeat(1001) }]) expect((await patch("m1", bad)).status, JSON.stringify(bad).slice(0, 40)).toBe(400);
    expect(await audit()).toEqual([]);
  });

  it("delete removes it and is audited without the sender's data", async () => {
    await msg("m1");
    expect((await item.DELETE(call("/api/admin/messages/m1", { method: "DELETE" }), ctx("m1"))).status).toBe(200);
    expect(await doc("m1")).toBeUndefined();
    expect((await audit()).map((a) => a.action)).toEqual(["message.delete"]);
  });
});
