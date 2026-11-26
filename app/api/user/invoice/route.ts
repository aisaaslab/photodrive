import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/firebase/admin-guard";
import { getStripe, StripeConfigError } from "@/lib/server/billing/stripe";
import { clientIp, getRateLimiter, rateLimitHeaders } from "@/lib/server/rate-limit";
import { requestLogger } from "@/lib/server/log";

/**
 * Link to the Stripe invoice for one of the signed-in user's own payments (S4-06). `?session=cs_...` names the payment (the id the
 * payments list returns). Only the owner of the payment gets an answer: anything else, including a payment that does not exist,
 * is the same 404. The invoice itself is Stripe's hosted page (it carries the PDF download), so nothing is stored or generated here.
 */
export async function GET(req: NextRequest) {
  const log = requestLogger(req, "user.invoice");
  const uid = await getUidFromRequest(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await getRateLimiter().limit({ name: "invoice", id: `${uid}|${clientIp(req)}`, limit: 30, windowSec: 60 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(limit) });

  const sessionId = req.nextUrl.searchParams.get("session") ?? "";
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const notFound = () => NextResponse.json({ error: "No invoice for this payment" }, { status: 404 });
  const payment = (await getAdminDb().collection("payments").doc(sessionId).get()).data();
  if (!payment || payment.uid !== uid) return notFound();

  let stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    if (!(err instanceof StripeConfigError)) throw err;
    log.error(err.message);
    return NextResponse.json({ error: "Payments are not configured" }, { status: 500 });
  }

  try {
    let invoiceId = typeof payment.invoiceId === "string" && payment.invoiceId ? payment.invoiceId : null;
    if (!invoiceId) {
      // The invoice may have been attached after the payment was recorded: ask Stripe once, and remember it.
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      invoiceId = typeof session.invoice === "string" ? session.invoice : (session.invoice?.id ?? null);
      if (!invoiceId) return notFound();
      await getAdminDb().collection("payments").doc(sessionId).set({ invoiceId }, { merge: true });
    }
    const invoice = await stripe.invoices.retrieve(invoiceId);
    if (!invoice.hosted_invoice_url) return notFound();
    return NextResponse.json({ url: invoice.hosted_invoice_url, pdf: invoice.invoice_pdf ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    log.error("invoice lookup failed", { sessionId, err: String(err) });
    return NextResponse.json({ error: "Could not load the invoice" }, { status: 502 });
  }
}
