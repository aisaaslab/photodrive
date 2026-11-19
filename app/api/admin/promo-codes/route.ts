import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";
import { PROMO_COLLECTION, normalizeCode, validAccessDays, MAX_ACCESS_DAYS } from "@/lib/promo-codes";

const CODE_RE = /^[A-Z0-9_-]{2,40}$/;

/**
 * GET: every free-code rule with its redemption count, plus "unmanaged" codes —
 * codes people have already redeemed that have no rule yet (so the admin can
 * add one in a click).
 */
export async function GET(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getAdminDb();
  const [rulesSnap, paymentsSnap] = await Promise.all([
    db.collection(PROMO_COLLECTION).get(),
    db.collection("payments").get(),
  ]);

  // Redemptions = free ($0) checkouts per code.
  const redemptions = new Map<string, number>();
  for (const doc of paymentsSnap.docs) {
    const d = doc.data();
    if (d.amountTotal !== 0) continue;
    const code = normalizeCode(d.promoCode);
    if (!code) continue;
    redemptions.set(code, (redemptions.get(code) ?? 0) + 1);
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
}

/** POST: create a rule — { code, accessDays, note? }. */
export async function POST(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const code = normalizeCode(body.code);
  if (!CODE_RE.test(code)) {
    return NextResponse.json({ error: "Code must be 2–40 letters, numbers, - or _." }, { status: 400 });
  }
  const accessDays = validAccessDays(body.accessDays);
  if (!accessDays) {
    return NextResponse.json({ error: `Access length must be 1–${MAX_ACCESS_DAYS} days.` }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";

  const ref = getAdminDb().collection(PROMO_COLLECTION).doc(code);
  if ((await ref.get()).exists) {
    return NextResponse.json({ error: "A rule for this code already exists." }, { status: 409 });
  }
  const now = Date.now();
  await ref.set({ code, accessDays, note, active: true, createdAt: now, updatedAt: now });
  return NextResponse.json({ ok: true, code });
}
