import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/auth";
import { markReviewed } from "@/lib/server/billing/review";
import { writeAudit } from "@/lib/server/audit";

const Body = z.object({
  kind: z.enum(["event", "payment"]),
  id: z.string().min(1).max(200),
  note: z.string().max(500).optional(),
});

/** Admin only: mark a payment item (a flagged payment or a Stripe event that needed review) as reviewed (S2-16). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const uid = admin.user.uid;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const result = await markReviewed(getAdminDb(), { ...parsed.data, by: uid! });
  if (result === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result === "not_open") return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
  // Every administrator action leaves a trail (S7-03): which item, and the note the operator wrote.
  await writeAudit({ actorUid: uid!, action: parsed.data.kind === "event" ? "payment.review_event" : "payment.review", targetType: "payment", targetId: parsed.data.id, ...(parsed.data.note && { note: parsed.data.note }) });
  return NextResponse.json({ ok: true });
}
