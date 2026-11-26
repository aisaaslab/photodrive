/** The six app languages. Pure: importable from server code (unlike lib/i18n/index.tsx, which is a client module). */
export const LANGUAGES = ["el", "en", "nl", "de", "es", "it"] as const;
export type Lang = (typeof LANGUAGES)[number];

/** BCP-47 locale per UI language, for Intl date/number formatting. */
export const LOCALES: Record<Lang, string> = {
  el: "el-GR", en: "en-GB", nl: "nl-NL", de: "de-DE", es: "es-ES", it: "it-IT",
};

export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGUAGES as readonly string[]).includes(v);

/**
 * What to do about the language stored on the user's account (S2-13), given what is known on this device:
 *  - the visitor chose a language here (`local`): store it if the account does not have it yet;
 *  - no choice here but the account has one: adopt it, so the account's language follows the user to a new device;
 *  - neither: store the current (detected or default) language once, so server-sent e-mails have one to use.
 */
export type LanguageSync = { action: "none" } | { action: "store"; lang: Lang } | { action: "adopt"; lang: Lang };

export function decideLanguageSync(opts: { local: Lang | null; account: Lang | null; current: Lang }): LanguageSync {
  const { local, account, current } = opts;
  if (local) return account === local ? { action: "none" } : { action: "store", lang: local };
  if (account) return account === current ? { action: "none" } : { action: "adopt", lang: account };
  return { action: "store", lang: current };
}

/** The browser tab title per language. */
export const PAGE_TITLES: Record<Lang, string> = {
  el: "PhotoDrive, Επαγγελματικά galleries για φωτογράφους",
  en: "PhotoDrive, Professional galleries for photographers",
  nl: "PhotoDrive, Professionele galerijen voor fotografen",
  de: "PhotoDrive, Professionelle Galerien für Fotografen",
  es: "PhotoDrive, Galerías profesionales para fotógrafos",
  it: "PhotoDrive, Gallerie professionali per fotografi",
};
