import { z } from "zod";
import { text } from "./common";
import { CODE_RE, MAX_ACCESS_DAYS, normalizeCode, validAccessDays } from "@/lib/shared/promo";

const days = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const d = validAccessDays(v);
  if (d === null) ctx.addIssue({ code: "custom", message: `Access length must be 1–${MAX_ACCESS_DAYS} days.` });
  return d ?? 0;
});

/** POST /api/admin/promo-codes: a new free-code rule. The code is tidied (upper case, no spaces) before it is checked. */
export const PromoCreateBody = z.object({
  code: z.string().transform((v) => normalizeCode(v)).pipe(z.string().regex(CODE_RE, "Code must be 2–40 letters, numbers, - or _.")),
  accessDays: days,
  note: text(200).default(""),
});

/** PATCH /api/admin/promo-codes/[code]: any of the three, at least one. */
export const PromoUpdateBody = z.object({ accessDays: days.optional(), note: text(200).optional(), active: z.boolean().optional() })
  .refine((b) => b.accessDays !== undefined || b.note !== undefined || b.active !== undefined, { message: "Nothing to change." });
