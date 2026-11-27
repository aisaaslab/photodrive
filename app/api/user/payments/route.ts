import { NextRequest, NextResponse } from "next/server";
import { isAdminToken, requireUser } from "@/lib/server/auth";
import { paymentsCol } from "@/lib/server/repos/collections";

/**
 * Payment history for the signed-in user, read from the `payments` collection
 * written by the subscription activator (webhook + verify route). Powers the
 * payment confirmation list on the account page.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const uid = auth.user.uid;
  if (isAdminToken(auth.user)) {
    // Admin doesn't pay — return an empty list rather than "inactive".
    return NextResponse.json({ payments: [] });
  }

  const snap = await paymentsCol()
    .where("uid", "==", uid)
    .orderBy("activatedAt", "desc")
    .limit(20)
    .get();

  const payments = snap.docs.map((d) => {
    const data = d.data();
    return {
      sessionId: data.sessionId ?? d.id,
      amountTotal: typeof data.amountTotal === "number" ? data.amountTotal : null,
      currency: typeof data.currency === "string" ? data.currency : null,
      activatedAt: typeof data.activatedAt === "number" ? data.activatedAt : null,
      // What became of the payment (S2-15). Payments from before refunds were handled have no status: they are plain paid ones.
      status: ["refunded", "partially_refunded", "disputed", "dispute_lost"].includes(data.status) ? data.status : "fulfilled",
      refundedAmount: typeof data.refundedAmount === "number" ? data.refundedAmount : null,
      changedAt: typeof data.revokedAt === "number" ? data.revokedAt : null,
      // Whether Stripe issued an invoice for it (S4-06): purchases made before invoices were switched on have none.
      // What it bought (S5-12): the period, whether it was a free code, and when the access it gave ran to.
      interval: data.interval === "monthly" || data.interval === "yearly" ? data.interval : null,
      freeCode: data.source === "free_code",
      accessUntil: typeof data.expiresAtAfter === "number" ? data.expiresAtAfter : null,
      hasInvoice: typeof data.invoiceId === "string" && data.invoiceId.length > 0,
    };
  });

  return NextResponse.json({ payments });
}
