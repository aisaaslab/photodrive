import { describe, expect, it } from "vitest";
import { translations } from "@/lib/i18n";

const langs = Object.keys(translations) as (keyof typeof translations)[];
const sectionKeys = (lang: keyof typeof translations, section: string) =>
  Object.keys((translations[lang] as unknown as Record<string, Record<string, string>>)[section]).sort();

describe("subscribe copy (S1-08) is complete in all six languages", () => {
  it("has the six expected languages", () => {
    expect(langs.sort()).toEqual(["de", "el", "en", "es", "it", "nl"]);
  });

  it("every language has the same subscribe keys as English", () => {
    for (const lang of langs) expect(sectionKeys(lang, "subscribe"), lang).toEqual(sectionKeys("en", "subscribe"));
  });

  it("date messages contain the {date} placeholder and the button is non-empty", () => {
    for (const lang of langs) {
      const s = (translations[lang] as unknown as { subscribe: Record<string, string> }).subscribe;
      for (const k of ["currentAccess", "renewExtends", "expiredAccess"]) expect(s[k], `${lang}.${k}`).toContain("{date}");
      expect(s.renewBtn.length, lang).toBeGreaterThan(3);
    }
  });

  it("no language still advertises a hard-coded $99 account CTA", () => {
    for (const lang of langs) {
      const a = (translations[lang] as unknown as { account: Record<string, string> }).account;
      expect(a.subscribeCta, lang).not.toMatch(/\$\s*99/);
    }
  });
});
