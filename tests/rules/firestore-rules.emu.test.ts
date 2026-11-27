/** S4-03: Firestore security rules. The browser may write its own profile, never an access or billing field, and nothing else. */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, deleteField, doc, getDoc, getDocs, collection, setDoc, updateDoc } from "firebase/firestore";

let env: RulesTestEnvironment;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");

// Every field only the server may write. Keep in step with locked() in firestore.rules.
const LOCKED: Record<string, unknown> = {
  subscriptionStatus: "active",
  subscriptionExpiresAt: 4_102_444_800_000,
  compGranted: true,
  stripeCustomerId: "cus_attacker",
  planId: "plan_lifetime",
  planName: "Lifetime",
  planInterval: "lifetime",
  subscriptionSource: "free_code",
  promoCode: "FREE",
  remindersSent: { d7: 1 },
  language: "el",
  languageUpdatedAt: 1,
};

const PROFILE = { uid: "me", email: "me@example.com", name: "Me", createdAt: 1 };

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-photodrive", firestore: { rules: readFileSync("firestore.rules", "utf8"), host, port: Number(port) } });
});
afterAll(async () => void (await env.cleanup()));
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // A profile that already carries every locked field (as the server leaves it after a purchase).
    await setDoc(doc(db, "users/me"), { ...PROFILE, ...LOCKED });
    await setDoc(doc(db, "users/plain"), PROFILE);
    await setDoc(doc(db, "users/other"), { uid: "other", email: "o@example.com", name: "Other", createdAt: 1, subscriptionStatus: "active" });
    for (const [path, data] of Object.entries({
      "galleries/g1": { photographerId: "me", passwordHash: "x", passwordEnc: "y" },
      "gallery_selections/g1": { items: [], submission: { email: "client@example.com" } },
      "gallery_stats/g1": { galleryId: "g1", views: 3 },
      "favorites/f1": { galleryId: "g1", photoId: "p", sessionId: "s" },
      "payments/cs_1": { uid: "me" },
      "plans/p1": { name: "Plan" },
      "stripe_events/evt_1": { type: "x" },
      "customer_notices/n1": { uid: "me" },
      "contactMessages/m1": { email: "x@example.com" },
      "demo_galleries/d1": { folderId: "f" },
      "settings/site": { supportEmail: "x" },
    })) await setDoc(doc(db, path), data);
  });
});

const me = () => env.authenticatedContext("me").firestore();

describe("users/{uid}: access and billing fields are server-only", () => {
  it("this file tests every field that locked() in firestore.rules lists (and nothing it does not)", () => {
    const rules = readFileSync("firestore.rules", "utf8");
    const body = rules.slice(rules.indexOf("function locked()"), rules.indexOf("match /users/{uid}"));
    const listed = [...body.slice(body.indexOf("return [")).matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]).sort();
    expect(listed).toEqual(Object.keys(LOCKED).sort());
  });

  for (const [field, value] of Object.entries(LOCKED)) {
    it(`${field}: cannot be created, added, changed or removed by the browser`, async () => {
      // create a new profile that includes it
      await assertFails(setDoc(doc(env.authenticatedContext("new").firestore(), "users/new"), { uid: "new", email: "n@example.com", name: "N", createdAt: 1, [field]: value }));
      // add it to a profile that does not have it
      await assertFails(updateDoc(doc(env.authenticatedContext("plain").firestore(), "users/plain"), { [field]: value }));
      await assertFails(setDoc(doc(env.authenticatedContext("plain").firestore(), "users/plain"), { [field]: value }, { merge: true }));
      // change or remove it where it exists
      await assertFails(updateDoc(doc(me(), "users/me"), { [field]: typeof value === "string" ? `${value}-changed` : 0 }));
      await assertFails(updateDoc(doc(me(), "users/me"), { [field]: deleteField() }));
    });
  }

  it("a whole-document overwrite that drops or changes a locked field is refused too", async () => {
    await assertFails(setDoc(doc(me(), "users/me"), PROFILE)); // would delete every locked field
    await assertFails(setDoc(doc(me(), "users/me"), { ...PROFILE, ...LOCKED, subscriptionExpiresAt: 9_999_999_999_999 }));
  });

  it("writing a locked field back with the SAME value is not a change, so a normal profile save still works", async () => {
    await assertSucceeds(setDoc(doc(me(), "users/me"), { ...PROFILE, ...LOCKED, name: "Me Again" }));
  });
});

describe("users/{uid}: emailLower (S7-05)", () => {
  it("may be written as the lower-cased form of the profile's own e-mail", async () => {
    await assertSucceeds(setDoc(doc(env.authenticatedContext("fresh").firestore(), "users/fresh"), { uid: "fresh", email: "Fresh@Example.com", emailLower: "fresh@example.com", name: "F" }));
    await assertSucceeds(updateDoc(doc(me(), "users/me"), { email: "Me@Example.com", emailLower: "me@example.com" }));
  });
  it("cannot be set to anything else, so nobody can appear under another address", async () => {
    await assertFails(setDoc(doc(env.authenticatedContext("fresh").firestore(), "users/fresh"), { uid: "fresh", email: "f@example.com", emailLower: "boss@example.com", name: "F" }));
    await assertFails(updateDoc(doc(me(), "users/me"), { emailLower: "boss@example.com" }));
    await assertFails(updateDoc(doc(me(), "users/me"), { emailLower: 5 }));
  });
});

describe("users/{uid}: what the browser may still do", () => {
  it("create its own profile and edit its name and photo", async () => {
    await assertSucceeds(setDoc(doc(env.authenticatedContext("fresh").firestore(), "users/fresh"), { uid: "fresh", email: "f@example.com", name: "F" }));
    await assertSucceeds(updateDoc(doc(me(), "users/me"), { name: "New Name" }));
    await assertSucceeds(updateDoc(doc(me(), "users/me"), { photoURL: "https://example.com/p.png" }));
    await assertSucceeds(updateDoc(doc(me(), "users/me"), { photoURL: deleteField() }));
    await assertSucceeds(getDoc(doc(me(), "users/me")));
  });

  it("but only its own profile", async () => {
    const plain = env.authenticatedContext("plain").firestore();
    await assertFails(getDoc(doc(plain, "users/other")));
    await assertFails(updateDoc(doc(plain, "users/other"), { name: "Hacked" }));
    await assertFails(setDoc(doc(plain, "users/other"), { uid: "other", email: "x@example.com" }));
    await assertFails(setDoc(doc(plain, "users/brand-new"), { uid: "brand-new", email: "x@example.com" })); // a profile for someone else
    await assertFails(getDocs(collection(plain, "users"))); // no listing
  });

  it("not without signing in, and never deleting a profile", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, "users/me")));
    await assertFails(setDoc(doc(anon, "users/anon"), { uid: "anon", email: "a@example.com" }));
    await assertFails(updateDoc(doc(anon, "users/me"), { name: "x" }));
    await assertFails(deleteDoc(doc(me(), "users/me")));
  });
});

describe("everything else is server-only: no browser read or write, signed in or not", () => {
  const PATHS = [
    "galleries/g1", "gallery_selections/g1", "gallery_stats/g1", "favorites/f1", "payments/cs_1", "plans/p1", "stripe_events/evt_1",
    "customer_notices/n1", "contactMessages/m1", "demo_galleries/d1", "settings/site", "never_heard_of_it/x",
  ];
  for (const path of PATHS) {
    it(path, async () => {
      for (const db of [me(), env.unauthenticatedContext().firestore()]) {
        await assertFails(getDoc(doc(db, path)));
        await assertFails(setDoc(doc(db, path), { x: 1 }));
        await assertFails(updateDoc(doc(db, path), { x: 1 }));
        await assertFails(deleteDoc(doc(db, path)));
      }
    });
  }

  it("collections cannot be listed either", async () => {
    for (const name of ["galleries", "gallery_selections", "payments", "plans", "contactMessages"]) await assertFails(getDocs(collection(me(), name)));
  });
});
