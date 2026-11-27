import { describe, expect, it } from "vitest";
import { LANGUAGES } from "@/lib/i18n/languages";
import { GRACE_DAYS } from "@/lib/gallery/availability";
import { translations } from "./helpers-dictionaries";

/**
 * S9-07 (decision D3): public copy must say what the product does, in all six languages. Galleries stay available for at least 14 days
 * after a plan ends, may then show an "unavailable" page, and nothing is deleted. Nothing public may promise that a gallery never
 * goes offline, or that access is one annual payment (there are monthly plans too).
 *
 * Not covered here: the old landing page's `components/TrustSection.tsx` (hard-coded English, "The link stays live… doesn't expire on
 * its own"). It is removed with the old landing in S6-14, which must ship before GALLERY_LAPSE_ENFORCE is switched on.
 */
const en = translations.en;
const publicEnglish = () => [
  ...Object.values(en.terms).filter((v): v is string => typeof v === "string"),
  ...en.faq.questions.flatMap((q) => [q.q, q.a]),
  ...Object.values(en.landing.pricing).filter((v): v is string => typeof v === "string"),
  ...Object.values(en.landing.why).filter((v): v is string => typeof v === "string"),
  en.landing.faq.billingA,
];

describe("public copy follows decision D3", () => {
  it(`the Terms say what happens when access ends, with the ${GRACE_DAYS}-day figure, in every language`, () => {
    for (const lang of LANGUAGES) {
      const s = translations[lang].terms;
      expect(s.s7p3, lang).toContain(String(GRACE_DAYS));
      expect(s.s7p3.length, lang).toBeGreaterThan(200);
      // payments: still says nothing renews automatically, and no longer claims a single annual payment or "12 months"
      expect(`${s.s7p1} ${s.s7p2}`, lang).not.toMatch(/12 (months|maanden|Monate|meses|mesi|μήνες)|annual|jaarlijk|jährlich|anual|annuale|ετήσι/i);
      expect(`${s.s7p1} ${s.s7p2}`, lang).toMatch(/30/);
    }
  });

  it("the FAQ answers what happens to galleries when the plan ends, gallery expiry dates and automatic renewal, in every language", () => {
    for (const lang of LANGUAGES) {
      const qs = translations[lang].faq.questions;
      expect(qs.length, lang).toBe(en.faq.questions.length);
      const ends = qs.find((q) => q.a.includes(String(GRACE_DAYS)));
      expect(ends, `${lang}: plan-ends answer with the 14 days`).toBeDefined();
      // it must say nothing is deleted: every language's answer is longer than a one-liner and keeps Google Drive reassurance
      expect(ends!.a, lang).toMatch(/Google Drive/);
    }
  });

  it("no public English copy promises that a gallery never goes offline or that links live forever", () => {
    for (const text of publicEnglish()) {
      expect(text).not.toMatch(/doesn'?t expire|does not expire|never expire|stays? live|live forever|forever|permanent(ly)? (available|online)/i);
    }
  });

  it("the terms keep their promise that nothing renews automatically", () => {
    expect(en.terms.s7p2).toMatch(/does NOT renew automatically/);
    expect(en.terms.s7p2).toMatch(/no recurring charge/);
  });

  it("the terms 'last updated' date is no longer March 2026", () => {
    for (const lang of LANGUAGES) expect(translations[lang].terms.lastUpdated, lang).not.toMatch(/marzo|March|Μάρτιος|maart|März/i);
  });
});
