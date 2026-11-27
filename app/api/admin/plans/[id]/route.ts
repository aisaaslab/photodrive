import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { badRequest, route } from "@/lib/server/http";
import { plansCol } from "@/lib/server/repos/collections";
import { expirePublicPlans } from "@/lib/server/public-plans";
import { PlanBody, PlanToggleBody } from "@/lib/shared/schemas/plans";

const TOGGLES = ["isPublic", "active", "highlight"];
const issues = (e: import("zod").ZodError) => e.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message }));

/**
 * PATCH: update a plan (S8-03). Either the quick switches on the list (`isPublic`, `active`, `highlight`, alone) or a full edit of the
 * editable fields. A full edit that leaves the currency out keeps the plan's own (the old route reset every plan to US dollars on each
 * save), and the price is checked against that currency. Saving expires the cached pricing list and is audited.
 */
export const PATCH = route("admin.plans.patch", async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const actor = admin.user.uid;

  const { id } = await params;
  const docRef = plansCol().doc(id);
  const existing = await docRef.get();
  if (!existing.exists) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest(); }
  const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];

  // Quick switches send only their own keys.
  if (keys.length > 0 && keys.every((k) => TOGGLES.includes(k))) {
    const t = PlanToggleBody.safeParse(body);
    if (!t.success) return badRequest("Please check the plan's details.", issues(t.error));
    const update = { ...t.data, updatedAt: Date.now() };
    await docRef.update(update);
    expirePublicPlans();
    await writeAudit({ actorUid: actor, action: "plan.toggle", targetType: "plan", targetId: id, before: existing.data(), after: { ...existing.data(), ...update } });
    return NextResponse.json({ ok: true });
  }

  const storedCurrency = typeof existing.get("currency") === "string" ? existing.get("currency") : "usd";
  const parsed = PlanBody.safeParse({ currency: storedCurrency, ...(body as object) });
  if (!parsed.success) return badRequest("Please check the plan's details.", issues(parsed.error));
  const { currency, ...input } = parsed.data;
  const data = { ...input, currency: currency ?? storedCurrency };

  await docRef.update({ ...data, updatedAt: Date.now() });
  expirePublicPlans();
  await writeAudit({ actorUid: actor, action: "plan.update", targetType: "plan", targetId: id, before: existing.data(), after: { ...existing.data(), ...data } });
  return NextResponse.json({ ok: true });
});

/** DELETE: remove a plan. Users already assigned keep their access and the plan name snapshot stored on their profile. */
export const DELETE = route("admin.plans.delete", async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const { id } = await params;
  const docRef = plansCol().doc(id);
  const existing = await docRef.get();
  if (!existing.exists) return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  await docRef.delete();
  expirePublicPlans();
  await writeAudit({ actorUid: admin.user.uid, action: "plan.delete", targetType: "plan", targetId: id, before: existing.data() });
  return NextResponse.json({ ok: true });
});
