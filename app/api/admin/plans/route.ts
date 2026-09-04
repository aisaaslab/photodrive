import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";
import { listAllPlans, normalizePlanInput } from "@/lib/plans";

/** GET: all plans (admin back office — includes private + inactive). */
export async function GET(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const plans = await listAllPlans();
  return NextResponse.json({ plans });
}

/** POST: create a payment plan. */
export async function POST(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
  const ref = await getAdminDb().collection("plans").add({
    ...input,
    currency: "usd",
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id: ref.id });
}
