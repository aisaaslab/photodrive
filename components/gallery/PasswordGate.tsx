"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Logo } from "@/components/ui/Logo";
import { GalleryAvatar } from "@/components/gallery/GalleryAvatar";

interface Props {
  slug: string;
  galleryName?: string;
  /** Who shared it, so a visitor who received the link knows they are in the right place. */
  photographerName?: string;
  photographerPhotoURL?: string;
}

export function PasswordGate({ slug, galleryName, photographerName, photographerPhotoURL }: Props) {
  const { t } = useLanguage();
  const g = t.gallery;
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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
        // Select what was typed so the next attempt replaces it, and put the cursor back.
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (res.status === 429) {
        setError(g.tooManyAttempts);
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
    <main className="min-h-screen bg-canvas flex flex-col relative">
      
      {/* Top branding */}
      <div className="px-4 sm:px-8 py-4 sm:py-6 flex items-center justify-between">
        <Logo />
        <LanguageSwitcher variant="light" />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-scale-in">
          {/* Who shared it (or a lock when we do not know) */}
          <div className="flex items-center justify-center mb-6">
            {photographerName ? (
              <GalleryAvatar src={photographerPhotoURL || undefined} name={photographerName} size={56} />
            ) : (
              <div className="w-12 h-12 border border-line rounded-card flex items-center justify-center bg-surface">
                <svg aria-hidden className="w-5 h-5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
            )}
          </div>

          <div className="text-center mb-8">
            {galleryName && (
              <h1
                className="text-2xl font-bold text-fg mb-2 leading-tight break-words"
                style={{ fontFamily: "var(--font-brand), sans-serif" }}
              >
                {galleryName}
              </h1>
            )}
            {photographerName && <p className="mb-3 text-sm text-fg-soft">{g.sharedBy.replace("{name}", photographerName)}</p>}
            <p className="text-fg-muted text-sm leading-relaxed">
              {g.passwordProtected}
              <br />
              {g.passwordInstruction}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <label htmlFor="gallery-password" className="sr-only">{g.passwordPlaceholder}</label>
              <input
                id="gallery-password"
                ref={inputRef}
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (error) setError(""); }}
                placeholder={g.passwordPlaceholder}
                required
                autoFocus
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "gallery-password-error" : undefined}
                className="w-full bg-surface border border-line rounded-xl pl-12 pr-12 py-3.5 text-sm text-fg placeholder:text-fg-muted outline-none focus:ring-2 focus:ring-accent-deep/50 focus:border-accent-deep/50 text-center tracking-widest transition-all aria-[invalid=true]:border-danger"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-pressed={show}
                aria-label={show ? g.hidePassword : g.showPassword}
                title={show ? g.hidePassword : g.showPassword}
                className="absolute right-1.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
              >
                <svg aria-hidden className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                  {show
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>}
                </svg>
              </button>
            </div>

            {error && (
              <div id="gallery-password-error" role="alert" className="flex items-center justify-center gap-2 text-xs text-danger bg-danger/10 border border-danger/30 rounded-xl px-4 py-2.5">
                <svg aria-hidden className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-canvas rounded-pill py-3.5 text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-fg-muted/40 border-t-white rounded-full animate-spin" />
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
