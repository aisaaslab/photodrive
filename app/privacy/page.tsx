"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { OWNER_NAME, OWNER_VAT, OWNER_ADDRESS, SUPPORT_EMAIL } from "@/lib/branding";

export default function PrivacyPage() {
  const { t } = useLanguage();
  const p = t.privacy;

  return (
    <main className="bg-[#080808] text-white min-h-screen">
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-sm text-stone-400 hover:text-white transition-colors">{p.back}</Link>
          <LanguageSwitcher />
        </div>
      </nav>
      <div className="max-w-2xl mx-auto px-6 pt-24 pb-16">

        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {p.title}
        </h1>
        <p className="text-stone-400 text-sm mb-12">{p.lastUpdated}</p>

        <div className="space-y-8 text-stone-300 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{p.s1Title}</h2>
            <p>{p.s1Body}</p>
            <ul className="mt-2 space-y-1 text-stone-400">
              {/* Reuses the Terms labels rather than duplicating them into the
                  privacy block, which is a single-line literal in several locales. */}
              <li><span className="text-stone-300">{t.terms.s1Name}</span> {OWNER_NAME}</li>
              <li><span className="text-stone-300">{t.terms.s1Afm}</span> {OWNER_VAT}</li>
              <li><span className="text-stone-300">{t.terms.s1Address}</span> {OWNER_ADDRESS}</li>
              <li><span className="text-stone-300">{t.terms.s1Email}</span>{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white underline underline-offset-2">{SUPPORT_EMAIL}</a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{p.s2Title}</h2>
            <p className="font-medium text-stone-200 mb-2">{p.s2aTitle}</p>
            <ul className="list-disc list-inside space-y-1 text-stone-400 mb-4">
              <li>{p.s2ali1}</li>
              <li>{p.s2ali2}</li>
              <li>{p.s2ali3}</li>
              <li>{p.s2ali4}</li>
            </ul>
            <p className="font-medium text-stone-200 mb-2">{p.s2bTitle}</p>
            <ul className="list-disc list-inside space-y-1 text-stone-400">
              <li>{p.s2bli1}</li>
              <li>{p.s2bli2}</li>
              <li>{p.s2bli3}</li>
              <li>{p.s2bli4}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{p.s3Title}</h2>
            <ul className="list-disc list-inside space-y-2 text-stone-400">
              <li><span className="text-stone-300">{p.s3li1Label}</span> {p.s3li1}</li>
              <li><span className="text-stone-300">{p.s3li2Label}</span> {p.s3li2}</li>
              <li><span className="text-stone-300">{p.s3li3Label}</span> {p.s3li3}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{p.s4Title}</h2>
            <p className="mb-2">{p.s4Body}</p>
            <ul className="list-disc list-inside space-y-1 text-stone-400">
              <li>{p.s4li1}</li>
              <li>{p.s4li2}</li>
              <li><strong className="text-white">✗</strong> {p.s4li3}</li>
              <li><strong className="text-white">✗</strong> {p.s4li4}</li>
              <li><strong className="text-white">✗</strong> {p.s4li5}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{p.s5Title}</h2>
            <p className="mb-3">{p.s5Body}</p>
            <div className="space-y-3">
              <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                <p className="text-stone-200 font-medium mb-1">Google Firebase (Authentication & Firestore)</p>
                <p className="text-stone-400">Stores account details (email, name, UID) and gallery records. State the region you picked when creating your Firestore database. Policy: <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">firebase.google.com/support/privacy</a></p>
              </div>
              <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                <p className="text-stone-200 font-medium mb-1">Google Drive API</p>
                <p className="text-stone-400">Policy: <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">policies.google.com/privacy</a></p>
              </div>
              <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                <p className="text-stone-200 font-medium mb-1">Hosting Provider</p>
                <p className="text-stone-400">Replace this block with the privacy policy link of the hosting provider you actually use (e.g. Vercel, AWS, Hetzner, etc.).</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{p.s6Title}</h2>
            <p className="mb-3">{p.s6Body}</p>
            <div className="space-y-2">
              <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                <p className="text-stone-200 font-medium mb-1">{p.s6c1Title}</p>
                <p className="text-stone-400">{p.s6c1Body}</p>
              </div>
              <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                <p className="text-stone-200 font-medium mb-1">{p.s6c2Title}</p>
                <p className="text-stone-400">{p.s6c2Body}</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{p.s7Title}</h2>
            <ul className="list-disc list-inside space-y-1 text-stone-400">
              <li>{p.s7li1}</li>
              <li>{p.s7li2}</li>
              <li>{p.s7li3}</li>
              <li>{p.s7li4}</li>
              <li>{p.s7li5}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{p.s8Title}</h2>
            <p className="mb-3">{p.s8Intro}</p>
            <ul className="list-disc list-inside space-y-2 text-stone-400">
              <li><span className="text-stone-300">{p.s8li1Label}</span> {p.s8li1}</li>
              <li><span className="text-stone-300">{p.s8li2Label}</span> {p.s8li2}</li>
              <li><span className="text-stone-300">{p.s8li3Label}</span> {p.s8li3}</li>
              <li><span className="text-stone-300">{p.s8li4Label}</span> {p.s8li4}</li>
              <li><span className="text-stone-300">{p.s8li5Label}</span> {p.s8li5}</li>
              <li><span className="text-stone-300">{p.s8li6Label}</span> {p.s8li6}</li>
            </ul>
            <p className="mt-3">
              {p.s8Contact}{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white underline underline-offset-2">{SUPPORT_EMAIL}</a>.
              {" "}{p.s8Reply}
            </p>
            <p className="mt-2">
              {p.s8DPA}
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{p.s9Title}</h2>
            <p>{p.s9Body}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{p.s10Title}</h2>
            <p>{p.s10Body}</p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-base mb-3">{p.s11Title}</h2>
            <p>
              {p.s11Body}{" "}
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
