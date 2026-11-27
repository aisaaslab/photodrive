import { DAY_MS, isLifetime } from "@/lib/shared/billing-access";
import { planPhase } from "@/lib/gallery/availability";

/**
 * Where a customer's plan stands, for the billing page and the dashboard (S9-02). Pure: no I/O, no clock (callers pass `now`).
 *
 *  - `admin`     an administrator: no plan needed;
 *  - `lifetime`  lifetime access, nothing to renew;
 *  - `comped`    access an administrator granted by hand, still running;
 *  - `active`    a running plan with time to spare;
 *  - `expiring`  a running plan in its last days (a week for a monthly plan, a month otherwise): time to renew;
 *  - `grace`     the plan has ended but the galleries are still online (decision D3: 14 days; only while lapse enforcement is on);
 *  - `lapsed`    the plan has ended (and, with enforcement on, the grace period is over, so galleries are offline for visitors);
 *  - `none`      never subscribed.
 */
export type BillingState = "admin" | "lifetime" | "comped" | "active" | "expiring" | "grace" | "lapsed" | "none";

export type BillingStateInput = {
  admin?: boolean;
  expiresAt?: number | null;
  /** Granted by an administrator rather than bought. */
  comped?: boolean;
  interval?: string | null;
  /** Whether a lapsed plan really takes galleries offline after the grace period (GALLERY_LAPSE_ENFORCE). */
  lapseEnforced: boolean;
  now: number;
};

export type BillingSummary = {
  state: BillingState;
  /** Whole days until the plan ends (0 once it has), or null when there is no end to count to. */
  daysLeft: number | null;
  /** Last moment the galleries stay online after the plan ended (grace), when that applies. */
  graceEndsAt: number | null;
  /** True when the galleries are hidden from visitors because of the plan (lapsed with enforcement on). */
  galleriesOffline: boolean;
};

/** How close to the end a running plan must be before it counts as "expiring": the last week of a monthly plan, the last month otherwise. */
export const renewalNudgeDays = (interval: string | null | undefined) => (interval === "monthly" ? 7 : 30);

export function billingSummary(input: BillingStateInput): BillingSummary {
  const { now } = input;
  const exp = typeof input.expiresAt === "number" && Number.isFinite(input.expiresAt) && input.expiresAt > 0 ? input.expiresAt : null;
  const out = (state: BillingState, extra: Partial<BillingSummary> = {}): BillingSummary => ({ state, daysLeft: null, graceEndsAt: null, galleriesOffline: false, ...extra });

  if (input.admin) return out("admin");
  if (exp === null) return out("none");
  if (isLifetime(exp)) return out("lifetime");

  if (exp > now) {
    const daysLeft = Math.ceil((exp - now) / DAY_MS);
    if (input.comped) return out("comped", { daysLeft });
    return out(daysLeft <= renewalNudgeDays(input.interval) ? "expiring" : "active", { daysLeft });
  }

  if (input.lapseEnforced) {
    const p = planPhase({ expiresAt: exp }, now);
    if (p.phase === "grace") return out("grace", { daysLeft: 0, graceEndsAt: p.graceEndsAt });
    return out("lapsed", { daysLeft: 0, galleriesOffline: true });
  }
  return out("lapsed", { daysLeft: 0 });
}
