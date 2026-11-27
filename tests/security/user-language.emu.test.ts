/** S2-13: the user's preferred language is stored by a validated endpoint, and only by it (Firestore rules). */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedUser } from "../helpers/seed";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});

const { PUT } = await import("@/app/api/user/language/route");
const { userLanguage } = await import("@/lib/server/user-language");

let n = 0;
let asUid = "u1";
const put = (body: unknown, opts: { token?: string | null; raw?: string } = {}) =>
  PUT(
    new NextRequest("http://localhost/api/user/language", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-real-ip": `203.0.113.${++n}`,
        ...(opts.token === null ? {} : { authorization: `Bearer ${opts.token ?? "t"}` }),
      },
      body: opts.raw ?? JSON.stringify(body),
    }),
  );
const stored = (uid = "u1") => testDb().collection("users").doc(uid).get().then((s) => s.data()!);

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  asUid = "u1";
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async () => ({ uid: asUid })) as never);
  await seedUser("u1", { name: "Anna", subscriptionStatus: "active", subscriptionExpiresAt: 123 });
});

describe("PUT /api/user/language", () => {
  it("stores each of the six languages and nothing else changes on the account", async () => {
    for (const language of ["el", "en", "nl", "de", "es", "it"]) {
      const res = await put({ language });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, language });
      expect(await stored()).toMatchObject({ language, name: "Anna", subscriptionStatus: "active", subscriptionExpiresAt: 123 });
    }
    expect((await stored()).languageUpdatedAt).toBeGreaterThan(0);
  });

  it("is what the server reads back for writing to the user", async () => {
    await put({ language: "el" });
    expect(userLanguage(await stored())).toBe("el");
  });

  it("rejects anything that is not one of the six languages, and changes nothing", async () => {
    await put({ language: "nl" });
    for (const body of [{ language: "fr" }, { language: "EN" }, { language: "" }, { language: null }, { language: 1 }, {}, [], "el", null]) {
      const res = await put(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect((await put(undefined, { raw: "{nope" })).status).toBe(400);
    expect((await stored()).language).toBe("nl");
  });

  it("needs a signed-in user", async () => {
    expect((await put({ language: "el" }, { token: null })).status).toBe(401);
    vi.spyOn(testAuth(), "verifyIdToken").mockRejectedValue(new Error("bad token"));
    expect((await put({ language: "el" })).status).toBe(401);
    expect((await stored()).language).toBeUndefined();
  });

  it("only ever changes the caller's own account", async () => {
    await seedUser("u2", { name: "Bob" });
    asUid = "u2";
    await put({ language: "de" });
    expect((await stored("u2")).language).toBe("de");
    expect((await stored("u1")).language).toBeUndefined();
  });

  it("does not create a half-empty account for a user with no profile yet", async () => {
    asUid = "no-profile";
    const res = await put({ language: "el" });
    expect(res.status).toBe(409);
    expect((await testDb().collection("users").doc("no-profile").get()).exists).toBe(false);
  });

  it("is rate limited per user", async () => {
    // a user of its own: the limiter is shared across this file and the other tests already used u1's quota
    await seedUser("limited", { name: "L" });
    asUid = "limited";
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) statuses.push((await put({ language: "el" })).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[21]).toBe(429);
  });
});

describe("Firestore rules: `language` is server-written only", () => {
  let env: RulesTestEnvironment;
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-photodrive",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host, port: Number(port) },
    });
  });
  afterAll(async () => void (await env.cleanup()));
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/me"), { email: "me@example.com", name: "Me", createdAt: 1 });
      await setDoc(doc(ctx.firestore(), "users/other"), { email: "o@example.com", name: "Other", createdAt: 1 });
    });
  });

  it("a signed-in user cannot write their own language directly (the endpoint validates it)", async () => {
    const me = env.authenticatedContext("me").firestore();
    await assertFails(updateDoc(doc(me, "users/me"), { language: "el" }));
    await assertFails(updateDoc(doc(me, "users/me"), { language: "klingon" }));
    await assertFails(updateDoc(doc(me, "users/me"), { languageUpdatedAt: 1 }));
    await assertFails(setDoc(doc(env.authenticatedContext("new").firestore(), "users/new"), { email: "n@example.com", name: "N", language: "el" }));
  });

  it("they can still update ordinary profile fields and read their own profile", async () => {
    const me = env.authenticatedContext("me").firestore();
    await assertSucceeds(updateDoc(doc(me, "users/me"), { name: "Me Again" }));
    await assertSucceeds(getDoc(doc(me, "users/me")));
  });

  it("existing protections are intact: no subscription fields, no one else's profile", async () => {
    const me = env.authenticatedContext("me").firestore();
    await assertFails(updateDoc(doc(me, "users/me"), { subscriptionStatus: "active" }));
    await assertFails(updateDoc(doc(me, "users/me"), { compGranted: true }));
    await assertFails(getDoc(doc(me, "users/other")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users/me")));
  });
});
