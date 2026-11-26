"use client";

import { LanguageMenu } from "@/components/landing/LanguageMenu";

/** The language picker used across the app: the design's globe + code + chevron menu. (`variant` is kept for existing call sites.) */
export function LanguageSwitcher({ variant }: { variant?: "dark" | "light" }) {
  void variant;
  return <LanguageMenu />;
}
