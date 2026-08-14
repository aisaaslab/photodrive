"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SUPPORT_EMAIL, OWNER_NAME, OWNER_VAT, OWNER_ADDRESS, OWNER_TAX_OFFICE } from "@/lib/branding";

export default function TermsPage() {
  const { t } = useLanguage();
  const s = t.terms;

  return (
    <main className="bg-[#080808] text-white min-h-screen">
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-sm text-stone-400 hover:text-white transition-colors">{s.back}</Link>
          <LanguageSwitcher />
        </div>
      </nav>
      <div className="max-w-2xl mx-auto px-6 pt-24 pb-16">

        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {s.title}
        </h1>
        <p className="text-stone-400 text-sm mb-12">{s.lastUpdated}</p>

        <div className="space-y-8 text-stone-300 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{s.s1Title}</h2>
            <p>{s.s1Body}</p>
            <ul className="mt-2 space-y-1 text-stone-400">
              <li><span className="text-stone-300">{s.s1Name}</span> {OWNER_NAME}</li>
              <li><span className="text-stone-300">{s.s1Afm}</span> {OWNER_VAT}</li>
              <li><span className="text-stone-300">{s.s1Address}</span> {OWNER_ADDRESS}</li>
              {OWNER_TAX_OFFICE ? (
                <li><span className="text-stone-300">{s.s1Doy}</span> {OWNER_TAX_OFFICE}</li>
              ) : null}
              <li><span className="text-stone-300">{s.s1Email}</span>{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white underline underline-offset-2">{SUPPORT_EMAIL}</a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{s.s2Title}</h2>
            <p>{s.s2Body}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{s.s3Title}</h2>
            <p>{s.s3Body}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{s.s4Title}</h2>
            <p className="mb-2">{s.s4p1}</p>
            <p>{s.s4p2}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{s.s5Title}</h2>
            <p className="mb-2">{s.s5Intro}</p>
            <ul className="list-disc list-inside space-y-1 text-stone-400">
              <li>{s.s5li1}</li>
              <li>{s.s5li2}</li>
              <li>{s.s5li3}</li>
              <li>{s.s5li4}</li>
              <li>{s.s5li5}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{s.s6Title}</h2>
            <p>{s.s6Body}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{s.s7Title}</h2>
            <p className="mb-2">{s.s7p1}</p>
            <p>{s.s7p2}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{s.s8Title}</h2>
            <p>{s.s8Body}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{s.s9Title}</h2>
            <p>{s.s9Body}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{s.s10Title}</h2>
            <p>{s.s10Body}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{s.s11Title}</h2>
            <p>{s.s11Body}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{s.s12Title}</h2>
            <p>{s.s12Body}{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white underline underline-offset-2">
                {SUPPORT_EMAIL}
              </a>
            </p>
          </section>

        </div>
      </div>
    </main>
  );
}
