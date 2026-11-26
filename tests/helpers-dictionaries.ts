import { el } from "@/lib/i18n/dictionaries/el";
import { en } from "@/lib/i18n/dictionaries/en";
import { nl } from "@/lib/i18n/dictionaries/nl";
import { de } from "@/lib/i18n/dictionaries/de";
import { es } from "@/lib/i18n/dictionaries/es";
import { it } from "@/lib/i18n/dictionaries/it";
import type { Lang } from "@/lib/i18n/languages";
import type { Translations } from "@/lib/i18n/load";

/** All six dictionaries by language, for tests that compare them (the app itself only ever loads one at a time). */
export const translations: Record<Lang, Translations> = { el, en, nl, de, es, it };
