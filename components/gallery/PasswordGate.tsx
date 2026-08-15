"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

interface Props {
  slug: string;
  galleryName?: string;
}

export function PasswordGate({ slug, galleryName }: Props) {
  const { t } = useLanguage();
  const g = t.gallery;
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/gallery/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, password }),
      });

      if (res.ok) {
        router.refresh();
      } else if (res.status === 401) {
        setError(g.wrongPassword);
      } else {
        setError(g.connectionError);
      }
    } catch {
      setError(g.noInternet);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 flex flex-col relative">
      <div className="aurora-bg-light"><span /></div>
      {/* Top branding */}
      <div className="px-4 sm:px-8 py-4 sm:py-6 flex items-center justify-between">
        <span className="text-stone-400 font-semibold text-sm" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          PhotoDrive
        </span>
        <LanguageSwitcher variant="light" />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-scale-in">
          {/* Icon */}
          <div className="flex items-center justify-center mb-8">
            <div className="w-12 h-12 border border-stone-200 rounded-2xl flex items-center justify-center bg-white">
              <svg className="w-5 h-5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
          </div>

          <div className="text-center mb-8">
            {galleryName && (
              <h1
                className="text-2xl font-bold text-stone-900 mb-3 leading-tight"
                style={{ fontFamily: "var(--font-brand), sans-serif" }}
              >
                {galleryName}
              </h1>
            )}
            <p className="text-stone-500 text-sm leading-relaxed">
              {g.passwordProtected}
              <br />
              {g.passwordInstruction}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={g.passwordPlaceholder}
              required
              autoFocus
              className="w-full bg-white border border-stone-300 rounded-xl px-4 py-3.5 text-sm text-stone-900 placeholder-stone-400 outline-none focus:ring-2 focus:ring-[#2D6A6A]/50 focus:border-[#2D6A6A]/50 text-center tracking-widest transition-all"
            />

            {error && (
              <div className="flex items-center justify-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-stone-900 text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-stone-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                g.enter
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
