import { NextRequest, NextResponse } from "next/server";
import { getPlanById } from "@/lib/plans";

/**
 * Public single-plan lookup. Any ACTIVE plan is returned by id — including
 * private ones, whose Firestore ids are unguessable, so the admin can share a
 * direct /subscribe?plan={id} link with a specific client.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await getPlanById(id);
  if (!plan || !plan.active) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }
  return NextResponse.json({
    plan: {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      interval: plan.interval,
      priceCents: plan.priceCents,
      currency: plan.currency,
      features: plan.features,
      highlight: plan.highlight,
    },
  });
}
