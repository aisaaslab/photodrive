"use client";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { LanguageProvider, type Lang, type Translations } from "@/lib/i18n";
import { LanguageSync } from "@/components/auth/LanguageSync";

export function ClientProviders({ lang, dictionary, children }: { lang: Lang; dictionary: Translations; children: React.ReactNode }) {
  return (
    <LanguageProvider initialLang={lang} initialDictionary={dictionary}>
      <AuthProvider>
        <LanguageSync />
        {children}
      </AuthProvider>
    </LanguageProvider>
  );
}
