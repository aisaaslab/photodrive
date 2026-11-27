import { minorUnitDigits } from "@/lib/shared/money";

/**
 * What a payment plan may be, and how a price typed by an administrator becomes the integer Stripe charges (S8-03). Pure: shared by the
 * admin API (which enforces it) and the plan editor (which shows the problems as the administrator types).
 *
 * `priceCents` is the amount in the currency's MINOR unit exactly as Checkout's `unit_amount` wants it: 9900 for $99.00, but 500 for
 * ¥500 (a zero-decimal currency). The old "× 100" for every currency would have charged a yen plan a hundred times too much.
 */
export const PLAN_CURRENCIES = ["usd", "eur", "gbp", "cad", "aud", "nzd", "chf", "sek", "nok", "dkk", "pln", "czk", "jpy"] as const;
export type PlanCurrency = (typeof PLAN_CURRENCIES)[number];
export const isPlanCurrency = (v: unknown): v is PlanCurrency => typeof v === "string" && (PLAN_CURRENCIES as readonly string[]).includes(v);

export const CURRENCY_NAME: Record<PlanCurrency, string> = {
  usd: "US dollar", eur: "Euro", gbp: "British pound", cad: "Canadian dollar", aud: "Australian dollar", nzd: "New Zealand dollar",
  chf: "Swiss franc", sek: "Swedish krona", nok: "Norwegian krone", dkk: "Danish krone", pln: "Polish złoty", czk: "Czech koruna", jpy: "Japanese yen",
};

/** Stripe's largest single amount, in minor units. */
export const MAX_PRICE_MINOR = 99_999_999;

/**
 * Roughly the smallest amount Stripe will charge in each currency, in minor units. A price below it may be refused at checkout, so the
 * editor warns (it does not block: Stripe's own list is the authority and can change).
 */
export const STRIPE_MIN_MINOR: Record<PlanCurrency, number> = {
  usd: 50, eur: 50, gbp: 30, cad: 50, aud: 50, nzd: 50, chf: 50, sek: 300, nok: 300, dkk: 250, pln: 200, czk: 1500, jpy: 50,
};

export type PriceResult = { ok: true; minor: number } | { ok: false; error: string };

/**
 * A price in major units (what a person types: "99", "99.9", "99.90") to minor units, exactly. Refuses what the currency cannot
 * express (12.345 dollars, 99.5 yen), a price of zero or less, and one Stripe could not take.
 */
export function toMinorUnits(input: unknown, currency: string): PriceResult {
  const text = typeof input === "number" ? (Number.isFinite(input) ? String(input) : "") : typeof input === "string" ? input.trim().replace(",", ".") : "";
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: "Enter the price as a number, for example 99 or 99.90." };
  const digits = minorUnitDigits(currency);
  const [whole, frac = ""] = text.split(".");
  if (frac.replace(/0+$/, "").length > digits) {
    return { ok: false, error: digits === 0 ? `${currency.toUpperCase()} has no decimals: enter a whole number.` : `${currency.toUpperCase()} allows at most ${digits} decimals.` };
  }
  const minor = Number(whole) * 10 ** digits + Number((frac + "0".repeat(digits)).slice(0, digits) || 0);
  if (!Number.isSafeInteger(minor) || minor <= 0) return { ok: false, error: "The price must be greater than zero." };
  if (minor > MAX_PRICE_MINOR) return { ok: false, error: "That price is too large." };
  return { ok: true, minor };
}

/** A stored amount back to what is typed in the price box ("99", "99.9", "500"): the inverse of `toMinorUnits`. */
export function toMajorString(minor: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  if (digits === 0) return String(Math.round(minor));
  const s = (minor / 10 ** digits).toFixed(digits);
  return s.replace(/\.?0+$/, "");
}

export type PlanWarning = { level: "info" | "warn"; text: string };
type Other = { id: string; name: string; interval: string; currency: string; isPublic: boolean; active: boolean };

/**
 * Things worth knowing before saving a plan (S8-03): will it appear on the landing page, will it clash with another plan, will Stripe take
 * it. Advice only; none of it blocks saving. The landing page pairs a plan's monthly and yearly variants by name to show "save N %".
 */
export function planWarnings(
  draft: { id?: string; name: string; interval: string; currency: string; priceMinor: number | null; isPublic: boolean; active: boolean },
  others: Other[],
): PlanWarning[] {
  const out: PlanWarning[] = [];
  const name = draft.name.trim().toLowerCase();
  const live = (p: Other) => p.active && p.isPublic && p.id !== draft.id;
  const everyoneElse = others.filter((p) => p.id !== draft.id);

  if (!draft.active) out.push({ level: "info", text: "Inactive: hidden from checkout and the landing page, and cannot be assigned. People who already have it keep their access." });
  else if (!draft.isPublic) out.push({ level: "info", text: "Private: not shown on the landing page. It can be bought through its direct link or assigned to a user." });

  if (name && draft.active && draft.isPublic) {
    const twin = everyoneElse.find((p) => live(p) && p.name.trim().toLowerCase() === name && p.interval === draft.interval);
    if (twin) out.push({ level: "warn", text: `Another public plan is already called “${draft.name.trim()}” with ${draft.interval} billing. The pricing section pairs plans by name, so only one of them can show for each period. Give this one a different name.` });
    const other = draft.interval === "monthly" ? "yearly" : "monthly";
    const pair = everyoneElse.find((p) => live(p) && p.name.trim().toLowerCase() === name && p.interval === other);
    if (pair && pair.currency !== draft.currency) out.push({ level: "warn", text: `Its ${other} counterpart is priced in ${pair.currency.toUpperCase()}, so the landing page cannot compare the two and shows no “save” percentage. Use the same currency for both.` });
  }

  if (draft.priceMinor !== null && isPlanCurrency(draft.currency) && draft.priceMinor < STRIPE_MIN_MINOR[draft.currency]) {
    out.push({ level: "warn", text: "This price is below the smallest amount Stripe usually accepts in this currency, so checkout may be refused." });
  }
  return out;
}
