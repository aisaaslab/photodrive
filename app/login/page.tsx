"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/") ? next : "/dashboard");
    }
  }, [user, loading, router]);

  return (
    <main className="min-h-screen flex flex-col bg-stone-950">
      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-6">
        <Link href="/" className="text-white font-semibold tracking-tight" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          PhotoDrive
        </Link>
        <LanguageSwitcher />
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-scale-in">
          <div className="text-center mb-10">
            <h1
              className="text-3xl font-bold text-white mb-3"
              style={{ fontFamily: "var(--font-brand), sans-serif" }}
            >
              {t.login.title}
            </h1>
            <p className="text-stone-500 text-sm leading-relaxed">
              {t.login.subtitle.split("\n").map((line, i) => (
                <span key={i}>{line}{i === 0 && <br />}</span>
              ))}
            </p>
          </div>

          <div className="bg-stone-900 border border-white/8 rounded-2xl p-6" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div className={`flex justify-center transition-opacity duration-200 ${!agreed ? "opacity-40 pointer-events-none" : ""}`}>
              <GoogleSignInButton />
            </div>
            <div className="mt-5 pt-5 border-t border-white/5">
              <p className="text-xs text-stone-600 text-center leading-relaxed">
                {t.login.driveNote.split("\n").map((line, i) => (
                  <span key={i}>{line}{i === 0 && <br />}</span>
                ))}
              </p>
            </div>
          </div>

          <label className="flex items-start gap-3 mt-6 cursor-pointer group">
            <div className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                className="sr-only"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <div className={`w-4 h-4 rounded border transition-all duration-150 flex items-center justify-center ${
                agreed
                  ? "bg-[#17509e] border-[#17509e]"
                  : "bg-transparent border-stone-600 group-hover:border-stone-400"
              }`}>
                {agreed && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-xs text-stone-500 leading-relaxed">
              {t.login.agree}{" "}
              <Link href="/terms" className="text-stone-300 underline underline-offset-2 hover:text-white transition-colors">
                {t.login.terms}
              </Link>{" "}
              {t.login.and}{" "}
              <Link href="/privacy" className="text-stone-300 underline underline-offset-2 hover:text-white transition-colors">
                {t.login.privacy}
              </Link>
              .
            </span>
          </label>
        </div>
      </div>
    </main>
  );
}
