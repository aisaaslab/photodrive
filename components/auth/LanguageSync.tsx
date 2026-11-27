"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { decideLanguageSync, isLang } from "@/lib/i18n/languages";

/**
 * Keeps the language stored on the signed-in user's account in step with the one chosen in the browser (S2-13).
 * Renders nothing. Failures are ignored: the UI never depends on this, it only lets the server write to the user
 * in their language later.
 */
export function LanguageSync() {
  const { user, profile, refreshProfile } = useAuth();
  const { lang, setLanguage } = useLanguage();
  const attempted = useRef<string>("");

  useEffect(() => {
    if (!user || !profile || profile.uid !== user.uid) return; // wait until the account's profile is loaded

    const decision = decideLanguageSync({
      local: readLocal(),
      account: isLang(profile.language) ? profile.language : null,
      current: lang,
    });
    if (decision.action === "none") return;
    if (decision.action === "adopt") {
      setLanguage(decision.lang);
      return;
    }

    const key = `${user.uid}:${decision.lang}`;
    if (attempted.current === key) return; // one try per value, so a failing request cannot loop
    attempted.current = key;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/user/language", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ language: decision.lang }),
        });
        if (res.ok) await refreshProfile();
      } catch {
        // ignore: best effort
      }
    })();
  }, [user, profile, lang, setLanguage, refreshProfile]);

  return null;
}

function readLocal() {
  try {
    const v = localStorage.getItem("lang");
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}
