"use client";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { LanguageProvider } from "@/lib/i18n";
import { LanguageSync } from "@/components/auth/LanguageSync";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <AuthProvider>
        <LanguageSync />
        {children}
      </AuthProvider>
    </LanguageProvider>
  );
}
