import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { fulfilCheckoutSession, UnmatchedPayment } from "@/lib/server/billing/fulfil";
import { StripeConfigError } from "@/lib/server/billing/stripe";
import { parseJson, route } from "@/lib/server/http";
import { requestLogger } from "@/lib/server/log";
import { paymentsCol, stripeEventsCol, usersCol } from "@/lib/server/repos/collections";
import { ASSIGNABLE_OUTCOMES } from "@/lib/shared/admin-payments";

const Body = z.object({ uid: z.string().min(1).max(128).optional(), note: z.string().trim().max(300).optional() });
const SESSION_ID = /^cs_[A-Za-z0-9_]{4,200}$/;

/**
 * Admin-only: re-sync one Checkout Session with Stripe (S8-01). Asks Stripe for the session and, if it was paid, makes sure the customer
 * has the access it paid for. Safe to repeat: it uses the same idempotent path as the webhook (`fulfilCheckoutSession`), so a session
 * that was already fulfilled changes nothing. For a payment that could not be matched to anyone, the body's `uid` names the customer to
 * credit. Every call is audited, and a fulfilled session closes the "needs review" Stripe events that were waiting for it.
 */
export const POST = route("admin.payments.resync", async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const log = requestLogger(req, "admin.payments.resync");

  const { id } = await params;
  if (!SESSION_ID.test(id)) return NextResponse.json({ error: "That is not a Checkout Session id" }, { status: 400 });
  const body = await parseJson(req, Body);
  if (!body.ok) return body.response;
  const { uid: chosenUid, note } = body.data;

  const db = getAdminDb();
  if (chosenUid) {
    const exists = (await usersCol(db).doc(chosenUid).get()).exists || (await getAdminAuth().getUser(chosenUid).then(() => true, () => false));
    if (!exists) return NextResponse.json({ error: "That customer does not exist" }, { status: 404 });
  }

  const before = await paymentsCol(db).doc(id).get();
  const audit = (after: Record<string, unknown>) =>
    writeAudit({ actorUid: admin.user.uid, action: "payment.resync", targetType: "payment", targetId: id, before: { paymentRecorded: before.exists, uid: before.get("uid") ?? null }, after, ...(note && { note }) });

  try {
    const r = await fulfilCheckoutSession(id, { source: "admin", ...(chosenUid ? { uid: chosenUid } : {}) });
    await audit({ state: r.state, ...(r.state !== "pending" ? { uid: r.uid, expiresAt: r.expiresAt } : {}), ...(r.state === "fulfilled" ? { grantedDays: Math.round(r.grantedMs / 86_400_000) } : {}) });

    if (r.state === "pending") {
      return NextResponse.json({ ok: false, state: "pending", error: "Stripe has not collected this payment, so nothing was granted." }, { status: 409 });
    }

    // The session is fulfilled now (by this call or earlier): close the events that were waiting for exactly this, an unmatched payment.
    // Anything else on the same session (a partial refund, a dispute) needs a person's decision and is never closed by a re-sync.
    const waiting = await stripeEventsCol(db).where("sessionId", "==", id).where("status", "==", "needs_review").get();
    const closable = waiting.docs.filter((d) => !d.get("resolvedAt") && ASSIGNABLE_OUTCOMES.includes(d.get("outcome")));
    const now = Date.now();
    await Promise.all(closable.map((d) =>
      d.ref.update({ resolvedAt: now, resolvedBy: admin.user.uid, resolutionNote: (note ? `${note} · ` : "") + "Re-synced by an administrator" })));

    return NextResponse.json({ ok: true, state: r.state, uid: r.uid, expiresAt: r.expiresAt, ...(r.state === "fulfilled" ? { grantedDays: Math.round(r.grantedMs / 86_400_000) } : {}),
      // Asked to credit someone, but the session had already been credited to another customer: nothing was changed.
      ...(chosenUid && r.uid !== chosenUid ? { creditedToOther: true } : {}), closedEvents: closable.length });
  } catch (err) {
    if (err instanceof UnmatchedPayment) {
      await audit({ state: "unmatched" });
      return NextResponse.json({ ok: false, state: "unmatched", error: "Stripe says this was paid, but it cannot be matched to a customer. Choose the customer to credit." }, { status: 422 });
    }
    if (err instanceof StripeConfigError) return NextResponse.json({ error: "Stripe is not configured in this environment." }, { status: 503 });
    const code = (err as { code?: string })?.code;
    if (code === "resource_missing") return NextResponse.json({ error: "Stripe has no Checkout Session with that id (check test and live mode)." }, { status: 404 });
    log.error("re-sync failed", { sessionId: id, err });
    await audit({ state: "failed" });
    return NextResponse.json({ error: "Could not reach Stripe. Nothing was changed; please try again." }, { status: 502 });
  }
});
