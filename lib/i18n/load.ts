import type { Lang } from "./languages";
import type { Translations } from "./dictionaries/en";

export type { Translations };

/**
 * Loads one language's dictionary. Each language is its own file and its own chunk (dynamic import), so a page ships only the
 * language it is shown in; switching language fetches just the new one (S5-06).
 */
const loaders: Record<Lang, () => Promise<Translations>> = {
  el: () => import("./dictionaries/el").then((m) => m.el),
  en: () => import("./dictionaries/en").then((m) => m.en),
  nl: () => import("./dictionaries/nl").then((m) => m.nl),
  de: () => import("./dictionaries/de").then((m) => m.de),
  es: () => import("./dictionaries/es").then((m) => m.es),
  it: () => import("./dictionaries/it").then((m) => m.it),
};

export const loadDictionary = (lang: Lang): Promise<Translations> => loaders[lang]();
