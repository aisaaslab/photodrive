import "server-only";
import { isLang, type Lang } from "@/lib/i18n/languages";

/** The language to write to this user in (e-mails, notices). Falls back to English if none is stored or the value is junk. */
export function userLanguage(user: { language?: unknown } | null | undefined): Lang {
  return isLang(user?.language) ? user.language : "en";
}
