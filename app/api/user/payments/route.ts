import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/firebase/admin-guard";
import { getUidFromRequest } from "@/lib/firebase/admin-guard";
import { paymentsCol } from "@/lib/server/repos/collections";

/**
 * Payment history for the signed-in user, read from the `payments` collection
 * written by the subscription activator (webhook + verify route). Powers the
 * payment confirmation list on the account page.
 */
export async function GET(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isAdmin(uid)) {
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
      hasInvoice: typeof data.invoiceId === "string" && data.invoiceId.length > 0,
    };
  });

  return NextResponse.json({ payments });
}
