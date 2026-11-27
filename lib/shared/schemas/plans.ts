import { z } from "zod";
import { text } from "./common";
import { MAX_PRICE_MINOR, PLAN_CURRENCIES, toMinorUnits } from "@/lib/shared/plan-input";

/** What the plan editor sends, and the only shape the admin plan routes accept (S8-03). `price` is in major units and becomes `priceCents` (minor units) here. */
const Fields = z.object({
  name: text(80).min(1, "Plan name is required."),
  description: text(200).default(""),
  interval: z.enum(["monthly", "yearly"], { error: "Choose monthly or yearly." }),
  currency: z.enum(PLAN_CURRENCIES, { error: "Choose one of the supported currencies." }).optional(),
  price: z.union([z.number(), z.string()]),
  features: z.array(text(120)).max(12, "At most 12 features.").default([]).transform((f) => f.filter(Boolean)),
  isPublic: z.boolean().default(false),
  active: z.boolean().default(true),
  highlight: z.boolean().default(false),
  sortOrder: z.number().int("Sort order must be a whole number.").min(-9999).max(9999).default(0),
});

/**
 * `currency` is optional so an older client that omits it keeps the plan's stored currency (the route fills it in); a new plan defaults
 * to US dollars. The price is checked against the currency it is in, so ¥500 is stored as 500 and $99.90 as 9990.
 */
export const PlanBody = Fields.superRefine((v, ctx) => {
  const r = toMinorUnits(v.price, v.currency ?? "usd");
  if (!r.ok) ctx.addIssue({ code: "custom", path: ["price"], message: r.error });
}).transform((v) => {
  const r = toMinorUnits(v.price, v.currency ?? "usd");
  const { price: _price, ...rest } = v;
  void _price;
  return { ...rest, priceCents: r.ok ? Math.min(r.minor, MAX_PRICE_MINOR) : 0 };
});
export type PlanInput = z.output<typeof PlanBody>;

/** The quick on/off switches on the plan list send only these. */
export const PlanToggleBody = z.object({ isPublic: z.boolean().optional(), active: z.boolean().optional(), highlight: z.boolean().optional() })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Nothing to change." });
