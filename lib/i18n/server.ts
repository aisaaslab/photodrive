import "server-only";
import { cookies, headers } from "next/headers";
import { LANG_COOKIE, pickLanguage } from "./detect";
import type { Lang } from "./languages";
import { loadDictionary, type Translations } from "./load";

/**
 * The language this request is rendered in, and its dictionary (S5-06, D16): the visitor's `lang` cookie, else the browser's
 * `Accept-Language` on a first visit, else English. Reading the request makes the page render per request rather than at build time.
 */
export async function getLanguage(): Promise<{ lang: Lang; dictionary: Translations }> {
  const [jar, hdrs] = await Promise.all([cookies(), headers()]);
  const lang = pickLanguage({ cookie: jar.get(LANG_COOKIE)?.value, acceptLanguage: hdrs.get("accept-language") });
  return { lang, dictionary: await loadDictionary(lang) };
}
