"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ContactModal } from "@/components/contact/ContactModal";
import { SUPPORT_EMAIL as FALLBACK_EMAIL } from "@/lib/branding";

export default function ContactPage() {
  const { t } = useLanguage();
  const c = t.contact;
  const [open, setOpen] = useState(false);
  const [supportEmail, setSupportEmail] = useState(FALLBACK_EMAIL);

  // Runtime support email (admin-editable via Firestore `settings/site`,
  // no deploy needed). Falls back to the build-time env value.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/site-settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.supportEmail) setSupportEmail(data.supportEmail);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="bg-[#080808] text-white min-h-screen">
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl">
        <div className="max-w-lg mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-sm text-stone-400 hover:text-white transition-colors">{c.back}</Link>
          <LanguageSwitcher />
        </div>
      </nav>
      <div className="max-w-lg mx-auto px-6 pt-24 pb-16">

        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {c.title}
        </h1>
        <p className="text-stone-400 text-sm mb-10 leading-relaxed">
          {c.subtitle}
        </p>

        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-4 border border-white/8 rounded-2xl p-5 hover:border-white/20 hover:bg-white/[0.02] transition-all group text-left"
        >
          <div className="w-10 h-10 border border-white/8 rounded-xl flex items-center justify-center shrink-0 group-hover:border-white/20 transition-colors">
            <svg className="w-4 h-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-stone-500 mb-0.5">Email</p>
            <p className="text-white text-sm font-medium">{c.writeToUs} →</p>
          </div>
        </button>

        <p className="text-stone-500 text-xs leading-relaxed mt-8">
          {c.directEmail}{" "}
          <a href={`mailto:${supportEmail}`} className="text-stone-300 underline underline-offset-2 hover:text-white">
            {supportEmail}
          </a>
        </p>

        <p className="text-stone-500 text-xs leading-relaxed mt-2">
          {c.responseTime}
        </p>
      </div>

      <ContactModal open={open} onClose={() => setOpen(false)} />
    </main>
  );
}
