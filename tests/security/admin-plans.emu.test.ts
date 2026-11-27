/** S8-03: the admin Plans and Promo codes APIs against the real Firestore emulator. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedPayment, seedUser } from "../helpers/seed";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
const expire = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/public-plans", () => ({ expirePublicPlans: expire, getPublicPlans: vi.fn(), PUBLIC_PLANS_TAG: "public-plans" }));

const plans = await import("@/app/api/admin/plans/route");
const plan = await import("@/app/api/admin/plans/[id]/route");
const promos = await import("@/app/api/admin/promo-codes/route");
const promo = await import("@/app/api/admin/promo-codes/[code]/route");

let token = "boss-token";
const call = (url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) =>
  new NextRequest(`http://localhost${url}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
const send = (method: string, body?: unknown) => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const codeCtx = (code: string) => ({ params: Promise.resolve({ code }) });
const create = (body: unknown) => plans.POST(call("/api/admin/plans", send("POST", body)));
const patch = (id: string, body: unknown) => plan.PATCH(call(`/api/admin/plans/${id}`, send("PATCH", body)), ctx(id));
const stored = async (id: string) => (await testDb().collection("plans").doc(id).get()).data();
const audit = async () => (await testDb().collection("audit_log").get()).docs.map((d) => d.data()).sort((a, b) => a.at - b.at);
const ok = { name: "Pro", interval: "yearly", price: "99", isPublic: true };

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  expire.mockReset();
  token = "boss-token";
  vi.stubEnv("ADMIN_UID", "boss");
  vi.spyOn(testAuth(), "verifyIdToken").mockImplementation((async (t: string) => {
    if (t === "boss-token") return { uid: "boss" };
    if (t === "user-token") return { uid: "u1" };
    throw new Error("bad token");
  }) as never);
  await seedUser("boss");
});

describe("who may use it", () => {
  it("only administrators: a customer gets 403 and a visitor 401, and nothing changes", async () => {
    const id = (await (await create(ok)).json()).id;
    expire.mockReset();
    const calls = () => [
      plans.GET(call("/api/admin/plans")), create(ok), patch(id, { active: false }), plan.DELETE(call(`/api/admin/plans/${id}`, send("DELETE")), ctx(id)),
      promos.GET(call("/api/admin/promo-codes")), promos.POST(call("/api/admin/promo-codes", send("POST", { code: "X1", accessDays: 30 }))),
      promo.PATCH(call("/api/admin/promo-codes/X1", send("PATCH", { active: false })), codeCtx("X1")), promo.DELETE(call("/api/admin/promo-codes/X1", send("DELETE")), codeCtx("X1")),
    ];
    token = "user-token";
    for (const r of await Promise.all(calls())) expect(r.status).toBe(403);
    token = "nope";
    for (const r of await Promise.all(calls())) expect(r.status).toBe(401);
    expect((await testDb().collection("plans").get()).size).toBe(1);
    expect(await stored(id)).toMatchObject({ active: true });
    expect(expire).not.toHaveBeenCalled();
  });
});

describe("creating a plan", () => {
  it("stores the price in the currency's minor units, defaults to US dollars, expires the pricing cache and is audited", async () => {
    const res = await create({ ...ok, price: "99.90", description: " For studios ", features: [" A ", "", "B"], highlight: true, sortOrder: 3 });
    expect(res.status).toBe(200);
    const id = (await res.json()).id;
    expect(await stored(id)).toMatchObject({ name: "Pro", description: "For studios", interval: "yearly", priceCents: 9990, currency: "usd", features: ["A", "B"], isPublic: true, active: true, highlight: true, sortOrder: 3 });
    expect(expire).toHaveBeenCalledTimes(1);
    const log = await audit();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: "plan.create", targetType: "plan", targetId: id, actorUid: "boss", after: { priceCents: 9990, currency: "usd" } });
  });

  it("a plan can be in another currency, and a zero-decimal one (yen) is NOT multiplied by 100", async () => {
    const eur = await (await create({ ...ok, currency: "eur", price: "89" })).json();
    const jpy = await (await create({ ...ok, name: "Japan", currency: "jpy", price: "4800" })).json();
    expect(await stored(eur.id)).toMatchObject({ currency: "eur", priceCents: 8900 });
    expect(await stored(jpy.id)).toMatchObject({ currency: "jpy", priceCents: 4800 });
    expect((await create({ ...ok, currency: "jpy", price: "48.5" })).status).toBe(400);
  });

  it("an invalid plan says which fields are wrong, creates nothing, does not touch the cache and is not audited", async () => {
    for (const [bad, field] of [
      [{ ...ok, name: "  " }, "name"], [{ ...ok, price: "0" }, "price"], [{ ...ok, price: "12.345" }, "price"], [{ ...ok, price: "abc" }, "price"],
      [{ ...ok, interval: "weekly" }, "interval"], [{ ...ok, currency: "btc" }, "currency"], [{ ...ok, features: Array(13).fill("x") }, "features"],
    ] as const) {
      const res = await create(bad);
      const body = await res.json();
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(body.issues.map((i: { path: string }) => i.path), JSON.stringify(bad)).toContain(field);
    }
    expect((await create("nonsense")).status).toBe(400);
    expect((await testDb().collection("plans").get()).size).toBe(0);
    expect(expire).not.toHaveBeenCalled();
    expect(await audit()).toEqual([]);
  });
});

describe("changing a plan", () => {
  it("a full edit keeps the plan's own currency when none is sent (the old route reset every plan to USD), and checks the price against it", async () => {
    const id = (await (await create({ ...ok, currency: "jpy", price: "4800" })).json()).id;
    expire.mockReset();
    expect((await patch(id, { ...ok, price: "5200" })).status).toBe(200);
    expect(await stored(id)).toMatchObject({ currency: "jpy", priceCents: 5200 });
    expect(expire).toHaveBeenCalledTimes(1);
    expect((await patch(id, { ...ok, price: "52.5" })).status).toBe(400); // yen have no decimals
    expect(await stored(id)).toMatchObject({ priceCents: 5200 });
  });

  it("the currency can be changed on purpose", async () => {
    const id = (await (await create(ok)).json()).id;
    await patch(id, { ...ok, currency: "gbp", price: "79" });
    expect(await stored(id)).toMatchObject({ currency: "gbp", priceCents: 7900 });
  });

  it("the quick switches change only what they say, expire the cache and are audited with before and after", async () => {
    const id = (await (await create(ok)).json()).id;
    expire.mockReset();
    expect((await patch(id, { isPublic: false })).status).toBe(200);
    expect(await stored(id)).toMatchObject({ isPublic: false, name: "Pro", priceCents: 9900 });
    expect(expire).toHaveBeenCalledTimes(1);
    const toggle = (await audit()).at(-1)!;
    expect(toggle).toMatchObject({ action: "plan.toggle", before: { isPublic: true }, after: { isPublic: false } });
  });

  it("refuses a switch that is not a boolean and a body that mixes switches with garbage, changing nothing", async () => {
    const id = (await (await create(ok)).json()).id;
    expire.mockReset();
    expect((await patch(id, { active: "no" })).status).toBe(400);
    expect((await patch(id, { active: false, bogus: 1 })).status).toBe(400);
    expect((await patch(id, {})).status).toBe(400);
    expect(await stored(id)).toMatchObject({ active: true });
    expect(expire).not.toHaveBeenCalled();
  });

  it("404 for a plan that does not exist, with nothing created or audited", async () => {
    expect((await patch("ghost", { active: false })).status).toBe(404);
    expect((await plan.DELETE(call("/api/admin/plans/ghost", send("DELETE")), ctx("ghost"))).status).toBe(404);
    expect((await testDb().collection("plans").get()).size).toBe(0);
    expect(await audit()).toEqual([]);
  });

  it("delete removes it, expires the cache and is audited with what was deleted", async () => {
    const id = (await (await create(ok)).json()).id;
    expire.mockReset();
    expect((await plan.DELETE(call(`/api/admin/plans/${id}`, send("DELETE")), ctx(id))).status).toBe(200);
    expect(await stored(id)).toBeUndefined();
    expect(expire).toHaveBeenCalledTimes(1);
    expect((await audit()).at(-1)).toMatchObject({ action: "plan.delete", before: { name: "Pro" } });
  });
});

describe("free-code rules", () => {
  const make = (body: unknown) => promos.POST(call("/api/admin/promo-codes", send("POST", body)));
  const rule = async (code: string) => (await testDb().collection("promoCodes").doc(code).get()).data();

  it("creating tidies the code, validates the length, refuses a duplicate and is audited", async () => {
    const res = await make({ code: " free year ", accessDays: "365", note: " launch " });
    expect(res.status).toBe(200);
    expect(await rule("FREEYEAR")).toMatchObject({ code: "FREEYEAR", accessDays: 365, note: "launch", active: true });
    expect((await audit())[0]).toMatchObject({ action: "promo.create", targetId: "FREEYEAR", after: { accessDays: 365 } });
    expect((await make({ code: "freeyear", accessDays: 30 })).status).toBe(409);
    for (const bad of [{ code: "x", accessDays: 30 }, { code: "A B!", accessDays: 30 }, { code: "OKAY", accessDays: 0 }, { code: "OKAY", accessDays: 4000 }, { code: "OKAY", accessDays: "abc" }, { code: "OKAY" }]) {
      expect((await make(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await testDb().collection("promoCodes").get()).size).toBe(1);
  });

  it("an edit changes only what differs and audits only real changes; asking for what is already true records nothing", async () => {
    await make({ code: "SPRING", accessDays: 90 });
    const call2 = (body: unknown) => promo.PATCH(call("/api/admin/promo-codes/spring", send("PATCH", body)), codeCtx("spring"));
    expect(await (await call2({ accessDays: 90, active: true })).json()).toMatchObject({ ok: true, changed: false });
    expect(await (await call2({ accessDays: 180, note: "extended", active: false })).json()).toMatchObject({ changed: true });
    expect(await rule("SPRING")).toMatchObject({ accessDays: 180, note: "extended", active: false });
    const log = await audit();
    expect(log.map((a) => a.action)).toEqual(["promo.create", "promo.update"]);
    expect(log[1]).toMatchObject({ before: { accessDays: 90, active: true }, after: { accessDays: 180, active: false } });
    for (const bad of [{}, { accessDays: 0 }, { active: "yes" }]) expect((await call2(bad)).status, JSON.stringify(bad)).toBe(400);
  });

  it("404 for a rule that does not exist (nothing is audited), and delete is audited with what was removed", async () => {
    expect((await promo.PATCH(call("/api/admin/promo-codes/NOPE", send("PATCH", { active: false })), codeCtx("NOPE"))).status).toBe(404);
    expect((await promo.DELETE(call("/api/admin/promo-codes/NOPE", send("DELETE")), codeCtx("NOPE"))).status).toBe(404);
    expect(await audit()).toEqual([]);
    await make({ code: "GONE", accessDays: 30 });
    expect((await promo.DELETE(call("/api/admin/promo-codes/gone", send("DELETE")), codeCtx("gone"))).status).toBe(200);
    expect(await rule("GONE")).toBeUndefined();
    expect((await audit()).at(-1)).toMatchObject({ action: "promo.delete", targetId: "GONE", before: { accessDays: 30 } });
  });

  it("the list counts only free checkouts as redemptions, and shows codes people used that have no rule yet", async () => {
    await make({ code: "FREEYEAR", accessDays: 365 });
    await seedPayment("cs_f1", { uid: "u1", amountTotal: 0, promoCode: "freeyear" });
    await seedPayment("cs_f2", { uid: "u2", amountTotal: 0, promoCode: "FREEYEAR" });
    await seedPayment("cs_f3", { uid: "u3", amountTotal: 0, promoCode: "WILD" });
    await seedPayment("cs_paid", { uid: "u4", amountTotal: 9900, promoCode: "FREEYEAR" }); // a discounted paid checkout is not a free redemption
    await seedPayment("cs_none", { uid: "u5", amountTotal: 0 });
    const list = await (await promos.GET(call("/api/admin/promo-codes"))).json();
    expect(list.rules).toEqual([expect.objectContaining({ code: "FREEYEAR", accessDays: 365, redemptions: 2 })]);
    expect(list.unmanaged).toEqual([{ code: "WILD", redemptions: 1 }]);
  });
});
