import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { parseJson, route } from "@/lib/server/http";
import { paymentsCol, promoCodesCol } from "@/lib/server/repos/collections";
import { normalizeCode } from "@/lib/shared/promo";
import { PromoCreateBody } from "@/lib/shared/schemas/promo";

/**
 * GET: every free-code rule with its redemption count, plus "unmanaged" codes (codes people have already redeemed that have no rule yet,
 * so the admin can add one in a click). Redemptions are the free ($0) checkouts: only those payments are read (S8-03; it used to read
 * every payment ever made).
 */
export const GET = route("admin.promo.list", async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const db = getAdminDb();
  const [rulesSnap, freeSnap] = await Promise.all([
    promoCodesCol(db).get(),
    paymentsCol(db).where("amountTotal", "==", 0).select("promoCode").get(),
  ]);

  const redemptions = new Map<string, number>();
  for (const doc of freeSnap.docs) {
    const code = normalizeCode(doc.get("promoCode"));
    if (code) redemptions.set(code, (redemptions.get(code) ?? 0) + 1);
  }

  const rules = rulesSnap.docs
    .map((d) => {
      const data = d.data();
      return {
        code: d.id,
        accessDays: typeof data.accessDays === "number" ? data.accessDays : 0,
        note: typeof data.note === "string" ? data.note : "",
        active: data.active !== false,
        createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
        redemptions: redemptions.get(d.id) ?? 0,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  const ruled = new Set(rules.map((r) => r.code));
  const unmanaged = [...redemptions.entries()]
    .filter(([code]) => !ruled.has(code))
    .map(([code, count]) => ({ code, redemptions: count }))
    .sort((a, b) => b.redemptions - a.redemptions);

  return NextResponse.json({ rules, unmanaged });
});

/** POST: create a rule — { code, accessDays, note? }. */
export const POST = route("admin.promo.create", async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const body = await parseJson(req, PromoCreateBody, { message: "Please check the code's details." });
  if (!body.ok) return body.response;
  const { code, accessDays, note } = body.data;

  const ref = promoCodesCol().doc(code);
  if ((await ref.get()).exists) return NextResponse.json({ error: "A rule for this code already exists." }, { status: 409 });
  const now = Date.now();
  await ref.set({ code, accessDays, note, active: true, createdAt: now, updatedAt: now });
  await writeAudit({ actorUid: admin.user.uid, action: "promo.create", targetType: "promoCode", targetId: code, after: { code, accessDays, note, active: true } });
  return NextResponse.json({ ok: true, code });
});
