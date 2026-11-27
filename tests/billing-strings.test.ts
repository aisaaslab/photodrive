import { describe, expect, it } from "vitest";
import { translations } from "./helpers-dictionaries";
import { LANGUAGES } from "@/lib/i18n/languages";

/** S9-02: the billing page's wording, in all six languages. The page fills {date} and {days} in itself, so a translation that lost one would show a bare gap. */
describe("billing page strings", () => {
  const en = translations.en.billing;
  const keys = Object.keys(en) as (keyof typeof en)[];

  it("every language has every key, filled in", () => {
    for (const lang of LANGUAGES) {
      const b = translations[lang].billing;
      for (const k of keys) expect(b[k]?.trim().length, `${lang}.${k}`).toBeGreaterThan(1);
    }
  });

  it("the strings that take a date or a number keep their placeholder in every language", () => {
    const needs: Record<string, string> = { msgGrace: "{date}", msgComped: "{date}", lapseGrace: "{days}" };
    for (const lang of LANGUAGES) {
      for (const [k, ph] of Object.entries(needs)) expect(translations[lang].billing[k as keyof typeof en], `${lang}.${k}`).toContain(ph);
    }
  });

  it("no language has a placeholder the others lack", () => {
    for (const lang of LANGUAGES) {
      for (const k of keys) {
        const found = (translations[lang].billing[k].match(/\{\w+\}/g) ?? []).sort();
        expect(found, `${lang}.${k}`).toEqual((en[k].match(/\{\w+\}/g) ?? []).sort());
      }
    }
  });

  it("promises nothing about galleries going offline in the wording used when lapse enforcement is off", () => {
    for (const lang of LANGUAGES) {
      const b = translations[lang].billing;
      for (const k of ["lapseKept1", "lapseKept2", "msgLapsedKept"] as const) expect(b[k], `${lang}.${k}`).not.toMatch(/\{(date|days)\}/);
    }
  });
});
