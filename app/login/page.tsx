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

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-white/5" />
              <span className="text-[10px] text-stone-600 uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            {/* Email / password sign-in */}
            <form onSubmit={handleEmailSignIn} className="space-y-3">
              <div>
                <label className="block text-xs text-stone-500 mb-1.5">{t.login.emailLabel}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full bg-stone-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-600 outline-none focus:border-white/25 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1.5">{t.login.passwordLabel}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full bg-stone-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-600 outline-none focus:border-white/25 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={emailBusy || !agreed}
                className="w-full bg-white text-stone-900 font-bold py-2.5 rounded-xl text-sm hover:bg-stone-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {emailBusy ? (
                  <>
                    <div className="w-4 h-4 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" />
                    {t.login.signingIn}
                  </>
                ) : (
                  t.login.signInBtn
                )}
              </button>
            </form>

            {emailError && <p className="text-xs text-red-400 text-center mt-3">{emailError}</p>}

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
