"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Logo } from "@/components/ui/Logo";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);

  // Email / password sign-in (used by accounts created in the admin back office)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    if (!loading && user) {
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/") ? next : "/dashboard");
    }
  }, [user, loading, router]);

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (emailBusy || !agreed) return;
    setEmailError("");
    if (!email.trim() || !password) {
      setEmailError(t.login.invalidCredentials);
      return;
    }
    setEmailBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // onAuthStateChanged in the AuthProvider takes it from here — profile
      // upsert + redirect happen through the existing flow.
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (
        code.includes("invalid-credential") ||
        code.includes("wrong-password") ||
        code.includes("user-not-found") ||
        code.includes("invalid-email")
      ) {
        setEmailError(t.login.invalidCredentials);
      } else {
        setEmailError(t.login.emailError);
      }
      setEmailBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-canvas">
      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-6">
        <Link href="/" className="rounded-tile"><Logo /></Link>
        <LanguageSwitcher />
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-scale-in">
          <div className="text-center mb-10">
            <h1
              className="text-3xl font-bold text-fg mb-3"
              style={{ fontFamily: "var(--font-brand), sans-serif" }}
            >
              {t.login.title}
            </h1>
            <p className="text-fg-muted text-sm leading-relaxed">
              {t.login.subtitle.split("\n").map((line, i) => (
                <span key={i}>{line}{i === 0 && <br />}</span>
              ))}
            </p>
          </div>

          <div className="bg-surface border border-line rounded-card p-6">
            <div className="flex justify-center">
              <GoogleSignInButton disabled={!agreed} />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-surface-2" />
              <span className="text-[10px] text-fg-muted uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-surface-2" />
            </div>

            {/* Email / password sign-in */}
            <form onSubmit={handleEmailSignIn} className="space-y-3">
              <Input label={t.login.emailLabel} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <Input label={t.login.passwordLabel} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <button
                type="submit"
                disabled={emailBusy || !agreed}
                className="w-full bg-accent text-canvas font-bold py-2.5 rounded-pill text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {emailBusy ? (
                  <>
                    <div className="w-4 h-4 border-2 border-canvas/30 border-t-canvas rounded-full animate-spin" />
                    {t.login.signingIn}
                  </>
                ) : (
                  t.login.signInBtn
                )}
              </button>
            </form>

            {emailError && <p className="text-xs text-danger text-center mt-3">{emailError}</p>}

            <div className="mt-5 pt-5 border-t border-line">
              <p className="text-xs text-fg-muted text-center leading-relaxed">
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
                className="sr-only peer"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <div className={`w-4 h-4 rounded border transition-all duration-150 flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas ${
                agreed
                  ? "bg-accent-deep border-accent-deep"
                  : "bg-transparent border-fg-muted/50 group-hover:border-fg-muted"
              }`}>
                {agreed && (
                  <svg className="w-2.5 h-2.5 text-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-xs text-fg-muted leading-relaxed">
              {t.login.agree}{" "}
              <Link href="/terms" className="text-fg-soft underline underline-offset-2 hover:text-fg transition-colors">
                {t.login.terms}
              </Link>{" "}
              {t.login.and}{" "}
              <Link href="/privacy" className="text-fg-soft underline underline-offset-2 hover:text-fg transition-colors">
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
