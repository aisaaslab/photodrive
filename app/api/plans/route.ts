import { NextResponse } from "next/server";
import { listPublicPlans } from "@/lib/plans";

/**
 * Public list of purchasable plans: active + public only, used by the landing
 * page pricing section and the subscribe page plan picker.
 */
export async function GET() {
  try {
    const plans = await listPublicPlans();
    return NextResponse.json({
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        interval: p.interval,
        priceCents: p.priceCents,
        currency: p.currency,
        features: p.features,
        highlight: p.highlight,
      })),
    });
  } catch {
    return NextResponse.json({ plans: [] });
  }
}
