import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { listAllPlans } from "@/lib/plans";
import { parseJson, route } from "@/lib/server/http";
import { plansCol } from "@/lib/server/repos/collections";
import { expirePublicPlans } from "@/lib/server/public-plans";
import { PlanBody } from "@/lib/shared/schemas/plans";

/** GET: all plans (admin back office — includes private + inactive). */
export const GET = route("admin.plans.list", async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  return NextResponse.json({ plans: await listAllPlans() });
});

/**
 * POST: create a payment plan (S8-03). The body is validated field by field (`PlanBody`): the price is in the plan's currency's major
 * units and is stored in minor units, exactly what Stripe will charge; the currency defaults to US dollars. Saving expires the cached
 * pricing list, so the landing page and the subscribe page show the new plan on their next view, and the change is audited.
 */
export const POST = route("admin.plans.create", async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const body = await parseJson(req, PlanBody, { message: "Please check the plan's details." });
  if (!body.ok) return body.response;
  const { currency: given, ...input } = body.data;
  const data = { ...input, currency: given ?? "usd" };

  const now = Date.now();
  const ref = await plansCol().add({ ...data, createdAt: now, updatedAt: now });

  expirePublicPlans();
  await writeAudit({ actorUid: admin.user.uid, action: "plan.create", targetType: "plan", targetId: ref.id, after: data });
  return NextResponse.json({ id: ref.id });
});
