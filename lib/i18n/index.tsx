"use client";

import { createContext, startTransition, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES, LOCALES, PAGE_TITLES, isLang, type Lang } from "./languages";
import { LANG_COOKIE, languageCookie } from "./detect";
import { loadDictionary, type Translations } from "./load";

export type { Lang, Translations };
export { LOCALES };

/**
 * The visitor's language for client components (S5-06). The server decides the language of the first render (cookie, else the browser's
 * Accept-Language, else English: lib/i18n/server.ts) and passes that one dictionary in, so there is no flash of another language and
 * only one language ships with the page. Choosing another language loads just that dictionary, remembers it in a cookie (so the server
 * renders in it next time) and in localStorage (read by the account language sync), and updates the tab title and <html lang>.
 * The hook's shape is unchanged: `{ lang, t, toggle, setLanguage }`.
 */
const LanguageContext = createContext<{
  lang: Lang;
  t: Translations;
  toggle: () => void;
  setLanguage: (l: Lang) => void;
}>({
  lang: "en",
  // Only reached by a component rendered outside the provider, which the app does not do.
  t: {} as Translations,
  toggle: () => {},
  setLanguage: () => {},
});

const hasLanguageCookie = () => document.cookie.split("; ").some((c) => c.startsWith(`${LANG_COOKIE}=`));

export function LanguageProvider({
  initialLang, initialDictionary, children,
}: {
  initialLang: Lang;
  initialDictionary: Translations;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{ lang: Lang; t: Translations }>({ lang: initialLang, t: initialDictionary });
  const router = useRouter();
  const current = useRef<Lang>(initialLang);
  // Only the most recent choice wins if the visitor clicks through languages faster than their files load.
  const latest = useRef(0);

  const applyLang = useCallback(async (next: Lang) => {
    const token = ++latest.current;
    const t = await loadDictionary(next);
    if (token !== latest.current) return;
    try { localStorage.setItem("lang", next); } catch { /* private mode */ }
    document.cookie = languageCookie(next, window.location.protocol === "https:");
    document.title = PAGE_TITLES[next];
    current.current = next;
    setState({ lang: next, t });
    // Sections rendered on the server (the landing page) took their text from the old language: ask the server to render the route
    // again, now that the cookie says `next`. Client components have already switched above, so nothing flashes.
    startTransition(() => router.refresh());
  }, [router]);

  // Visitors from before the cookie existed have their choice only in localStorage: adopt it once, which also sets the cookie so
  // the server renders in it from then on.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("lang"); } catch { /* private mode */ }
    if (!hasLanguageCookie() && isLang(saved) && saved !== initialLang) void applyLang(saved);
  }, [initialLang, applyLang]);

  // Keep <html lang> in sync with the active language so the browser applies language-correct casing, notably, Greek removes accents on
  // uppercase (text-transform: uppercase), e.g. "Πώς" → "ΠΩΣ" instead of "ΠΏΣ".
  useEffect(() => {
    document.documentElement.lang = state.lang;
  }, [state.lang]);

  function toggle() {
    void applyLang(LANGUAGES[(LANGUAGES.indexOf(current.current) + 1) % LANGUAGES.length]);
  }

  return (
    <LanguageContext.Provider value={{ lang: state.lang, t: state.t, toggle, setLanguage: (l) => void applyLang(l) }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
