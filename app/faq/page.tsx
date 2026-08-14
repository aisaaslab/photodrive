"use client";

import Link from "next/link";
import { useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SUPPORT_EMAIL } from "@/lib/branding";

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.08]">
      <button
        className="w-full text-left py-5 flex items-center justify-between gap-4"
        onClick={() => setOpen(!open)}
      >
        <span className="text-white font-medium text-base leading-snug">{q}</span>
        <span className={`text-white/60 text-xl shrink-0 transition-transform duration-200 ${open ? "rotate-45" : ""}`}>+</span>
      </button>
      {open && (
        <p className="text-stone-300 text-sm leading-relaxed pb-5">{a}</p>
      )}
    </div>
  );
}

export default function FAQPage() {
  const { t } = useLanguage();
  const f = t.faq;

  return (
    <main className="bg-[#080808] text-white min-h-screen">
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-sm text-stone-400 hover:text-white transition-colors">{f.back}</Link>
          <LanguageSwitcher />
        </div>
      </nav>
      <div className="max-w-2xl mx-auto px-6 pt-24 pb-16">

        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {f.title}
        </h1>
        <p className="text-stone-400 text-sm mb-12">{f.subtitle}</p>

        <div>
          {f.questions.map((faq) => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>

        <div className="mt-16 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 text-center">
          <p className="text-white font-medium mb-2">{f.noAnswerTitle}</p>
          <p className="text-stone-400 text-sm mb-4">{f.noAnswerSubtitle}</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-2 bg-white text-stone-900 font-semibold px-6 py-2.5 rounded-xl text-sm hover:bg-stone-100 transition-all"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>
      </div>
    </main>
  );
}

