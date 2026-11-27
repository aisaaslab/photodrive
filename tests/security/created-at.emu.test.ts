/** S4-01: the sign-up date is written once (client rules) and restored from Firebase Auth by a dry-run-first migration. */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { Timestamp } from "firebase-admin/firestore";
import { Timestamp as ClientTimestamp, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { clearEmulators, testDb } from "../helpers/db";
import { buildProfileWrite } from "@/lib/firestore/profile-write";
import { TOLERANCE_MS, applyRestore, planRestore, readProfiles, toMs } from "@/lib/server/migrations/restore-created-at";

const DAY = 24 * 60 * 60 * 1000;
const google = { email: "me@example.com", name: "Me", photoURL: undefined as string | undefined };

describe("Firestore rules and the real sign-in write", () => {
  let env: RulesTestEnvironment;
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
  beforeAll(async () => {
    env = await initializeTestEnvironment({ projectId: "demo-photodrive", firestore: { rules: readFileSync("firestore.rules", "utf8"), host, port: Number(port) } });
  });
  afterAll(async () => void (await env.cleanup()));
  beforeEach(() => env.clearFirestore());

  const signIn = async (uid: string) => {
    const db = env.authenticatedContext(uid).firestore();
    const ref = doc(db, "users", uid);
    const existing = await getDoc(ref).catch(() => null);
    const data = buildProfileWrite(uid, existing?.exists() ? existing.data() : undefined, google, serverTimestamp());
    return setDoc(ref, data, { merge: true });
  };
  const createdAt = (uid: string) => testDb().collection("users").doc(uid).get().then((s) => s.get("createdAt") as Timestamp);

  it("signing in twice leaves createdAt unchanged", async () => {
    await assertSucceeds(signIn("me")); // first sign-in creates the profile
    const first = await createdAt("me");
    expect(first.toMillis()).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 30));
    await assertSucceeds(signIn("me")); // second sign-in is an update without createdAt
    await assertSucceeds(signIn("me"));
    expect((await createdAt("me")).toMillis()).toBe(first.toMillis());
  });

  it("the client cannot change createdAt (the old code, which wrote it on every sign-in, is refused)", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "users/me"), { uid: "me", email: "me@example.com", name: "Me", createdAt: ClientTimestamp.fromMillis(1_000_000) }));
    const me = env.authenticatedContext("me").firestore();
    await assertFails(setDoc(doc(me, "users/me"), { uid: "me", email: "me@example.com", createdAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(me, "users/me"), { createdAt: 5 }, { merge: true }));
    await assertSucceeds(setDoc(doc(me, "users/me"), { name: "Renamed" }, { merge: true })); // other profile fields are still editable
    expect((await createdAt("me")).toMillis()).toBe(1_000_000);
  });

  it("creating a profile with a createdAt is still allowed", async () => {
    await assertSucceeds(setDoc(doc(env.authenticatedContext("new").firestore(), "users/new"), { uid: "new", email: "n@example.com", createdAt: serverTimestamp() }));
  });
});

describe("restore-created-at migration", () => {
  beforeEach(clearEmulators);
  const T = Date.UTC(2024, 0, 10);
  const auth = (uid: string, ms = T) => ({ uid, creationMs: ms });

  it("plan: a date reset by later sign-ins goes back to Auth's creation time, in the stored type", () => {
    const plan = planRestore(
      [
        { uid: "ts", email: "a@x.com", createdAt: Timestamp.fromMillis(T + 300 * DAY) },
        { uid: "num", email: "b@x.com", createdAt: T + 300 * DAY },
      ],
      [auth("ts"), auth("num")],
    );
    expect(plan.changes).toEqual([
      { uid: "ts", email: "a@x.com", from: new Date(T + 300 * DAY).toISOString(), to: new Date(T).toISOString(), as: "timestamp", reason: "reset_by_login" },
      { uid: "num", email: "b@x.com", from: new Date(T + 300 * DAY).toISOString(), to: new Date(T).toISOString(), as: "number", reason: "reset_by_login" },
    ]);
  });

  it("plan: only ever moves a date earlier, and only by more than a day", () => {
    const plan = planRestore(
      [
        { uid: "genuine", createdAt: Timestamp.fromMillis(T + 5_000) }, // written seconds after the account was created
        { uid: "edge", createdAt: Timestamp.fromMillis(T + TOLERANCE_MS) }, // exactly one day: still treated as genuine
        { uid: "earlier", createdAt: Timestamp.fromMillis(T - 10 * DAY) }, // already earlier than Auth (imported account): never moved later
        { uid: "just-over", createdAt: Timestamp.fromMillis(T + TOLERANCE_MS + 1) },
      ],
      [auth("genuine"), auth("edge"), auth("earlier"), auth("just-over")],
    );
    expect(plan.changes.map((c) => c.uid)).toEqual(["just-over"]);
    expect(plan.unchanged).toBe(3);
  });

  it("plan: a missing date is filled; a profile without an Auth account is reported and left alone", () => {
    const plan = planRestore([{ uid: "none", createdAt: undefined }, { uid: "gone", createdAt: 1 }, { uid: "bad", createdAt: undefined }], [auth("none"), { uid: "bad", creationMs: NaN }]);
    expect(plan.changes).toMatchObject([{ uid: "none", from: null, reason: "missing", as: "timestamp" }]);
    expect(plan.noAuthAccount).toEqual(["gone", "bad"]);
  });

  it("apply: writes only createdAt, keeps types, leaves everything else, and a second run has nothing left to do", async () => {
    const db = testDb();
    await db.collection("users").doc("ts").set({ email: "a@x.com", name: "A", subscriptionStatus: "active", createdAt: Timestamp.fromMillis(T + 300 * DAY) });
    await db.collection("users").doc("num").set({ email: "b@x.com", name: "B", createdAt: T + 200 * DAY });
    await db.collection("users").doc("ok").set({ email: "c@x.com", name: "C", createdAt: Timestamp.fromMillis(T + 1000) });
    const authUsers = [auth("ts"), auth("num"), auth("ok")];

    const dry = planRestore(await readProfiles(db), authUsers);
    expect(dry.changes).toHaveLength(2);
    expect((await db.collection("users").doc("ts").get()).get("createdAt").toMillis()).toBe(T + 300 * DAY); // planning wrote nothing

    expect(await applyRestore(db, dry.changes)).toBe(2);
    const ts = (await db.collection("users").doc("ts").get()).data()!;
    expect(ts.createdAt).toBeInstanceOf(Timestamp);
    expect(toMs(ts.createdAt)).toBe(T);
    expect(ts).toMatchObject({ email: "a@x.com", name: "A", subscriptionStatus: "active" });
    const num = (await db.collection("users").doc("num").get()).data()!;
    expect(num.createdAt).toBe(T); // still a number
    expect(toMs((await db.collection("users").doc("ok").get()).get("createdAt"))).toBe(T + 1000);

    expect(planRestore(await readProfiles(db), authUsers).changes).toEqual([]);
  });

  it("apply handles more than one batch", async () => {
    const db = testDb();
    const ids = Array.from({ length: 450 }, (_, i) => `u${i}`);
    for (let i = 0; i < ids.length; i += 200) {
      const b = db.batch();
      for (const id of ids.slice(i, i + 200)) b.set(db.collection("users").doc(id), { email: `${id}@x.com`, createdAt: Timestamp.fromMillis(T + 100 * DAY) });
      await b.commit();
    }
    const plan = planRestore(await readProfiles(db), ids.map((id) => auth(id)));
    expect(await applyRestore(db, plan.changes)).toBe(450);
    expect(planRestore(await readProfiles(db), ids.map((id) => auth(id))).changes).toHaveLength(0);
  });
});
