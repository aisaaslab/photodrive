import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { listAllPlans, normalizePlanInput } from "@/lib/plans";
import { plansCol } from "@/lib/server/repos/collections";
import { expirePublicPlans } from "@/lib/server/public-plans";

/** GET: all plans (admin back office — includes private + inactive). */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const plans = await listAllPlans();
  return NextResponse.json({ plans });
}

/** POST: create a payment plan. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const uid = admin.user.uid;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let input;
  try {
    input = normalizePlanInput(body);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const now = Date.now();
  const ref = await plansCol().add({
    ...input,
    currency: "usd",
    createdAt: now,
    updatedAt: now,
  });

  expirePublicPlans();
  await writeAudit({ actorUid: uid, action: "plan.create", targetType: "plan", targetId: ref.id, after: { ...input, currency: "usd" } });
  return NextResponse.json({ id: ref.id });
}
