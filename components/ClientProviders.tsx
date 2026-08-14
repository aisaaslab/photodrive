"use client";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { LanguageProvider } from "@/lib/i18n";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <AuthProvider>{children}</AuthProvider>
    </LanguageProvider>
  );
}
