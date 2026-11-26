import { isLang, type Lang } from "./languages";

/** The cookie that holds the visitor's chosen language. Readable by the server, so pages render in it from the first byte (D16). */
export const LANG_COOKIE = "lang";

/**
 * The best supported language from an `Accept-Language` header: highest quality first (ties keep the header's order), by the
 * language's primary subtag ("de-AT" is German). Null when none of them is supported.
 */
export function parseAcceptLanguage(header: string | null | undefined): Lang | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      // No q means 1; a q that is not a number marks a malformed entry, which is skipped.
      const qParam = params.find((p) => /^\s*q\s*=/i.test(p));
      const q = qParam === undefined ? 1 : Number(qParam.split("=")[1]?.trim() || NaN);
      return { code: tag.trim().toLowerCase().split("-")[0], q, index };
    })
    .filter((x) => x.code && x.code !== "*" && Number.isFinite(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return ranked.map((x) => x.code).find(isLang) ?? null;
}

/** Which language to render in: the visitor's saved choice, else their browser's preference, else English. */
export function pickLanguage({ cookie, acceptLanguage }: { cookie?: string | null; acceptLanguage?: string | null }): Lang {
  if (isLang(cookie)) return cookie;
  return parseAcceptLanguage(acceptLanguage) ?? "en";
}

/** The `Set-Cookie`-style value the browser stores when the visitor picks a language (a year, site-wide). */
export const languageCookie = (lang: Lang, secure: boolean) => `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
