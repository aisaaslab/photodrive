import { describe, expect, it } from "vitest";
import { LANGUAGES, decideLanguageSync, isLang } from "@/lib/i18n/languages";
import { userLanguage } from "@/lib/server/user-language";
import { LOCALES } from "@/lib/i18n";
import { translations } from "./helpers-dictionaries";

describe("language list", () => {
  it("is exactly the six languages the app is translated into", () => {
    expect([...LANGUAGES].sort()).toEqual(Object.keys(translations).sort());
    expect(Object.keys(LOCALES).sort()).toEqual([...LANGUAGES].sort());
  });

  it("isLang accepts those and nothing else", () => {
    for (const l of LANGUAGES) expect(isLang(l)).toBe(true);
    for (const bad of ["fr", "EN", "en-GB", "", null, undefined, 5, {}, ["en"]]) expect(isLang(bad)).toBe(false);
  });
});

describe("userLanguage (what language to write to a user in)", () => {
  it("uses the stored language, and English when there is none or the value is junk", () => {
    expect(userLanguage({ language: "el" })).toBe("el");
    expect(userLanguage({ language: "de" })).toBe("de");
    expect(userLanguage({})).toBe("en");
    expect(userLanguage(null)).toBe("en");
    expect(userLanguage(undefined)).toBe("en");
    expect(userLanguage({ language: "klingon" })).toBe("en");
    expect(userLanguage({ language: 7 })).toBe("en");
  });
});

describe("decideLanguageSync", () => {
  it("a language chosen on this device is stored when the account does not have it", () => {
    expect(decideLanguageSync({ local: "el", account: null, current: "el" })).toEqual({ action: "store", lang: "el" });
    expect(decideLanguageSync({ local: "el", account: "en", current: "el" })).toEqual({ action: "store", lang: "el" });
    expect(decideLanguageSync({ local: "el", account: "el", current: "el" })).toEqual({ action: "none" });
  });

  it("with no choice on this device the account's language is adopted (it follows the user to a new device)", () => {
    expect(decideLanguageSync({ local: null, account: "nl", current: "en" })).toEqual({ action: "adopt", lang: "nl" });
    expect(decideLanguageSync({ local: null, account: "nl", current: "nl" })).toEqual({ action: "none" });
  });

  it("a brand-new account gets the current (detected or default) language stored once", () => {
    expect(decideLanguageSync({ local: null, account: null, current: "en" })).toEqual({ action: "store", lang: "en" });
    expect(decideLanguageSync({ local: null, account: null, current: "it" })).toEqual({ action: "store", lang: "it" });
  });

  it("an explicit choice on this device wins over what the account says", () => {
    expect(decideLanguageSync({ local: "de", account: "es", current: "de" })).toEqual({ action: "store", lang: "de" });
  });

  it("settles: after acting, deciding again gives nothing to do (no loops)", () => {
    for (const local of [null, ...LANGUAGES]) {
      for (const account of [null, ...LANGUAGES]) {
        for (const current of LANGUAGES) {
          const first = decideLanguageSync({ local, account, current });
          if (first.action === "none") continue;
          const after = first.action === "store"
            ? decideLanguageSync({ local: local ?? current, account: first.lang, current: local ?? current })
            : decideLanguageSync({ local: first.lang, account, current: first.lang });
          // adopting stores the choice locally and the account already has it; storing makes the account match
          expect(after.action, JSON.stringify({ local, account, current })).toBe("none");
        }
      }
    }
  });
});
