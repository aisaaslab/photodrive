import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";
import { normalizePlanInput } from "@/lib/plans";

/** PATCH: update a plan (full replace of the editable fields). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const docRef = getAdminDb().collection("plans").doc(id);
  const existing = await docRef.get();
  if (!existing.exists) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Quick toggles (isPublic / active / highlight) send partial bodies.
  const toggleKeys = ["isPublic", "active", "highlight"] as const;
  const isToggle = Object.keys(body).length > 0 && Object.keys(body).every((k) => (toggleKeys as readonly string[]).includes(k));
  if (isToggle) {
    const update: Record<string, unknown> = { updatedAt: Date.now() };
    for (const k of toggleKeys) {
      if (k in body) update[k] = body[k] === true;
    }
    await docRef.update(update);
    return NextResponse.json({ ok: true });
  }

  let input;
  try {
    input = normalizePlanInput(body);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  await docRef.update({ ...input, currency: "usd", updatedAt: Date.now() });

  return NextResponse.json({ ok: true });
}

/** DELETE: remove a plan. Users already assigned keep their access and the
 * plan name snapshot stored on their profile. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const docRef = getAdminDb().collection("plans").doc(id);
  const existing = await docRef.get();
  if (!existing.exists) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }
  await docRef.delete();
  return NextResponse.json({ ok: true });
}
