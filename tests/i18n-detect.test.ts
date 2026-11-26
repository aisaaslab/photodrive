import { describe, expect, it } from "vitest";
import { LANG_COOKIE, languageCookie, parseAcceptLanguage, pickLanguage } from "@/lib/i18n/detect";
import { dictionaryProblems } from "@/lib/i18n/parity";
import { translations } from "./helpers-dictionaries";
import { LANGUAGES } from "@/lib/i18n/languages";

describe("parseAcceptLanguage", () => {
  it("uses the primary subtag", () => expect(parseAcceptLanguage("de-AT")).toBe("de"));
  it("honours quality values over order", () => expect(parseAcceptLanguage("fr;q=0.9, nl;q=0.8, de;q=0.95")).toBe("de"));
  it("keeps header order for ties and skips unsupported languages", () => expect(parseAcceptLanguage("fr, it, es")).toBe("it"));
  it("ignores q=0 and wildcards", () => expect(parseAcceptLanguage("de;q=0, *;q=0.5, el;q=0.1")).toBe("el"));
  it("is null when nothing is supported or the header is missing", () => {
    expect(parseAcceptLanguage("fr, ja")).toBeNull();
    expect(parseAcceptLanguage(null)).toBeNull();
    expect(parseAcceptLanguage("")).toBeNull();
  });
  it("copes with junk", () => expect(parseAcceptLanguage(";q=, ;;, de;q=abc, es")).toBe("es"));
});

describe("pickLanguage", () => {
  it("the saved cookie wins over the browser", () => expect(pickLanguage({ cookie: "nl", acceptLanguage: "de" })).toBe("nl"));
  it("an unknown cookie falls back to the browser, then English", () => {
    expect(pickLanguage({ cookie: "xx", acceptLanguage: "de" })).toBe("de");
    expect(pickLanguage({ cookie: "xx", acceptLanguage: "ja" })).toBe("en");
    expect(pickLanguage({})).toBe("en");
  });
});

describe("languageCookie", () => {
  it("is site-wide, lasts a year, and is Secure only on https", () => {
    expect(languageCookie("de", false)).toBe(`${LANG_COOKIE}=de; path=/; max-age=31536000; SameSite=Lax`);
    expect(languageCookie("de", true)).toMatch(/; Secure$/);
  });
});

describe("dictionary parity (the i18n:check rules)", () => {
  it("all six languages match English", () => {
    for (const lang of LANGUAGES) expect(dictionaryProblems(translations.en, translations[lang]), lang).toEqual([]);
  });
  it("flags missing, extra, empty and placeholder mismatches", () => {
    const ref = { a: { x: "Hi {name}", y: "Yo" } };
    expect(dictionaryProblems(ref, { a: { x: "Hallo", y: "" }, b: "z" }).sort()).toEqual(
      ["empty: a.y", "extra: b", "placeholders differ: a.x"].sort(),
    );
    expect(dictionaryProblems(ref, { a: { x: "Hi {name}" } })).toEqual(["missing: a.y"]);
  });
});
