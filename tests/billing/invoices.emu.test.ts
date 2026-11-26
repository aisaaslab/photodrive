/** S4-06: an invoice for every purchase (BILLING_FULFIL_V2), reachable from the Account page. */
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { NextRequest } from "next/server";
import { clearEmulators, testAuth, testDb } from "../helpers/db";
import { seedPayment, seedPlan, seedUser } from "../helpers/seed";
import { createFakeCustomers, sessionFixture } from "../helpers/stripe";

vi.mock("@/lib/firebase/admin", async () => {
  const db = await import("../helpers/db");
  return { getAdminDb: db.testDb, getAdminAuth: db.testAuth };
});
let asUid: string | null = "u1";
vi.mock("@/lib/firebase/admin-guard", async (orig) => ({
  ...(await orig<typeof import("@/lib/firebase/admin-guard")>()),
  getUidFromRequest: async () => asUid,
}));

const { getStripe } = await import("@/lib/server/billing/stripe");
const { POST: checkout } = await import("@/app/api/stripe/checkout/route");
const { GET: invoiceRoute } = await import("@/app/api/user/invoice/route");
const { GET: paymentsRoute } = await import("@/app/api/user/payments/route");
const { fulfilCheckoutSession } = await import("@/lib/server/billing/fulfil");

const SESSION = "cs_test_invoice0001";
let n = 0;
let invoices: MockInstance;
let sessions: MockInstance;

const getInvoice = (session: string, ip = `198.51.100.${++n % 250}`) =>
  invoiceRoute(new NextRequest(`http://localhost/api/user/invoice?session=${session}`, { headers: { authorization: "Bearer t", "x-real-ip": ip } }));
const paid = (over = {}) => sessionFixture("paid", { id: SESSION, metadata: { uid: "u1", planId: "m", interval: "monthly" }, invoice: "in_test_1", ...over });

beforeEach(async () => {
  await clearEmulators();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("BILLING_FULFIL_V2", "1");
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
  asUid = "u1";
  invoices = vi.spyOn(getStripe().invoices, "retrieve") as unknown as MockInstance;
  invoices.mockResolvedValue({ id: "in_test_1", hosted_invoice_url: "https://invoice.stripe.test/i/abc", invoice_pdf: "https://invoice.stripe.test/i/abc/pdf" });
  sessions = vi.spyOn(getStripe().checkout.sessions, "retrieve") as unknown as MockInstance;
  await seedUser("u1");
  await seedUser("u2");
  await seedPlan("m", { name: "Monthly", interval: "monthly", priceCents: 900, currency: "usd" });
});

describe("checkout asks Stripe for an invoice", () => {
  const fake = createFakeCustomers();
  const post = () => checkout(new NextRequest("http://localhost/api/stripe/checkout", { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify({ planId: "m" }) }));
  let create: MockInstance;
  beforeEach(() => {
    for (const m of ["create", "retrieve", "update", "search"] as const) vi.spyOn(getStripe().customers, m).mockImplementation(fake.impl[m] as never);
    create = vi.spyOn(getStripe().checkout.sessions, "create") as unknown as MockInstance;
    create.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
    vi.spyOn(testAuth(), "verifyIdToken").mockResolvedValue({ uid: "u1", email: "u1@example.com" } as never);
  });

  it("with the flag on: invoice_creation with the plan as description and the uid in the metadata", async () => {
    await post();
    expect(create.mock.calls[0][0].invoice_creation).toEqual({
      enabled: true,
      invoice_data: { description: expect.stringContaining("Monthly"), metadata: { uid: "u1", planId: "m", interval: "monthly", env: "staging" } },
    });
  });

  it("with the flag off the live shop is unchanged: no invoice_creation", async () => {
    vi.stubEnv("BILLING_FULFIL_V2", "");
    vi.spyOn(getStripe().checkout.sessions, "list").mockResolvedValue({ data: [] } as never);
    await post();
    expect(create.mock.calls[0][0]).not.toHaveProperty("invoice_creation");
  });
});

describe("the payment record and the payments list", () => {
  it("keeps the invoice id from the session (a string or an expanded object), and none when there is no invoice", async () => {
    await fulfilCheckoutSession(paid(), { source: "webhook" });
    expect((await testDb().collection("payments").doc(SESSION).get()).data()?.invoiceId).toBe("in_test_1");
    await fulfilCheckoutSession(paid({ id: "cs_test_invoice0002", invoice: { id: "in_test_2" } }), { source: "webhook" });
    expect((await testDb().collection("payments").doc("cs_test_invoice0002").get()).data()?.invoiceId).toBe("in_test_2");
    await fulfilCheckoutSession(paid({ id: "cs_test_invoice0003", invoice: null }), { source: "webhook" });
    expect((await testDb().collection("payments").doc("cs_test_invoice0003").get()).data()).not.toHaveProperty("invoiceId");
  });

  it("GET /api/user/payments says which payments have an invoice (and does not expose the invoice id)", async () => {
    await seedPayment("cs_with", { uid: "u1", sessionId: "cs_with", activatedAt: 2, invoiceId: "in_x" });
    await seedPayment("cs_without", { uid: "u1", sessionId: "cs_without", activatedAt: 1 });
    const body = await (await paymentsRoute(new NextRequest("http://localhost/api/user/payments", { headers: { authorization: "Bearer t" } }))).json();
    expect(body.payments.map((p: { sessionId: string; hasInvoice: boolean }) => [p.sessionId, p.hasInvoice])).toEqual([["cs_with", true], ["cs_without", false]]);
    expect(JSON.stringify(body)).not.toContain("in_x");
  });
});

describe("GET /api/user/invoice", () => {
  it("returns Stripe's hosted invoice link for the user's own payment", async () => {
    await seedPayment(SESSION, { uid: "u1", sessionId: SESSION, invoiceId: "in_test_1" });
    const res = await getInvoice(SESSION);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://invoice.stripe.test/i/abc", pdf: "https://invoice.stripe.test/i/abc/pdf" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(invoices).toHaveBeenCalledWith("in_test_1");
    expect(sessions).not.toHaveBeenCalled(); // the stored id was enough
  });

  it("only the owner: someone else's payment and a payment that does not exist are the same 404, and Stripe is never asked", async () => {
    await seedPayment(SESSION, { uid: "u2", sessionId: SESSION, invoiceId: "in_test_1" });
    const other = await getInvoice(SESSION);
    const missing = await getInvoice("cs_test_doesnotexist01");
    expect([other.status, missing.status]).toEqual([404, 404]);
    expect(await other.json()).toEqual(await missing.json());
    expect(invoices).not.toHaveBeenCalled();
    expect(sessions).not.toHaveBeenCalled();
  });

  it("needs sign-in and a well-formed session id", async () => {
    await seedPayment(SESSION, { uid: "u1", sessionId: SESSION, invoiceId: "in_test_1" });
    asUid = null;
    expect((await getInvoice(SESSION)).status).toBe(401);
    asUid = "u1";
    for (const bad of ["", "nope", "cs_test_", "../x", "in_test_1"]) expect((await getInvoice(bad)).status, bad).toBe(400);
  });

  it("a payment recorded before the invoice existed: asks Stripe once for the session's invoice and remembers it", async () => {
    await seedPayment(SESSION, { uid: "u1", sessionId: SESSION });
    sessions.mockResolvedValue({ id: SESSION, invoice: "in_late" });
    invoices.mockResolvedValue({ id: "in_late", hosted_invoice_url: "https://invoice.stripe.test/i/late", invoice_pdf: null });
    expect(await (await getInvoice(SESSION)).json()).toEqual({ url: "https://invoice.stripe.test/i/late", pdf: null });
    expect((await testDb().collection("payments").doc(SESSION).get()).data()?.invoiceId).toBe("in_late");
    sessions.mockClear();
    await getInvoice(SESSION);
    expect(sessions).not.toHaveBeenCalled();
  });

  it("no invoice for the payment (an older purchase), or an invoice with no hosted page: 404", async () => {
    await seedPayment(SESSION, { uid: "u1", sessionId: SESSION });
    sessions.mockResolvedValue({ id: SESSION, invoice: null });
    expect((await getInvoice(SESSION)).status).toBe(404);
    await seedPayment("cs_test_invoice0009", { uid: "u1", sessionId: "cs_test_invoice0009", invoiceId: "in_draft" });
    invoices.mockResolvedValue({ id: "in_draft", hosted_invoice_url: null });
    expect((await getInvoice("cs_test_invoice0009")).status).toBe(404);
  });

  it("a Stripe error is a 502 with no detail, never a crash", async () => {
    await seedPayment(SESSION, { uid: "u1", sessionId: SESSION, invoiceId: "in_test_1" });
    invoices.mockRejectedValue(new Error("stripe is down: sk_test_secret"));
    const res = await getInvoice(SESSION);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("sk_test");
  });

  it("is rate limited per user and visitor", async () => {
    await seedPayment(SESSION, { uid: "u1", sessionId: SESSION, invoiceId: "in_test_1" });
    const ip = "203.0.113.42";
    for (let i = 0; i < 30; i++) expect((await getInvoice(SESSION, ip)).status).toBe(200);
    const blocked = await getInvoice(SESSION, ip);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
