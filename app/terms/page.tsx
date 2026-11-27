"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { OWNER_NAME, OWNER_VAT, OWNER_ADDRESS, OWNER_TAX_OFFICE } from "@/lib/branding";
import { useSupportEmail } from "@/lib/use-support-email";

export default function TermsPage() {
  const { t } = useLanguage();
  const s = t.terms;
  // Admin-managed support email (Firestore `settings/site`), never env.
  const SUPPORT_EMAIL = useSupportEmail();

  return (
    <main className="bg-canvas text-fg min-h-screen">
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-line bg-canvas/90 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="inline-flex min-h-6 items-center text-sm text-fg-muted hover:text-fg transition-colors">{s.back}</Link>
          <LanguageSwitcher />
        </div>
      </nav>
      <div className="max-w-2xl mx-auto px-6 pt-24 pb-16">

        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {s.title}
        </h1>
        <p className="text-fg-muted text-sm mb-12">{s.lastUpdated}</p>

        <div className="space-y-8 text-fg-soft text-sm leading-relaxed">

          <section>
            <h2 className="text-fg font-semibold text-base mb-3">{s.s1Title}</h2>
            <p>{s.s1Body}</p>
            <ul className="mt-2 space-y-1 text-fg-muted">
              <li><span className="text-fg-soft">{s.s1Name}</span> {OWNER_NAME}</li>
              <li><span className="text-fg-soft">{s.s1Afm}</span> {OWNER_VAT}</li>
              <li><span className="text-fg-soft">{s.s1Address}</span> {OWNER_ADDRESS}</li>
              {OWNER_TAX_OFFICE ? (
                <li><span className="text-fg-soft">{s.s1Doy}</span> {OWNER_TAX_OFFICE}</li>
              ) : null}
              <li><span className="text-fg-soft">{s.s1Email}</span>{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-fg underline underline-offset-2">{SUPPORT_EMAIL}</a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-fg font-semibold text-base mb-3">{s.s2Title}</h2>
            <p>{s.s2Body}</p>
          </section>

          <section>
            <h2 className="text-fg font-semibold text-base mb-3">{s.s3Title}</h2>
            <p>{s.s3Body}</p>
          </section>

          <section>
            <h2 className="text-fg font-semibold text-base mb-3">{s.s4Title}</h2>
            <p className="mb-2">{s.s4p1}</p>
            <p>{s.s4p2}</p>
          </section>

          <section>
            <h2 className="text-fg font-semibold text-base mb-3">{s.s5Title}</h2>
            <p className="mb-2">{s.s5Intro}</p>
            <ul className="list-disc list-inside space-y-1 text-fg-muted">
              <li>{s.s5li1}</li>
              <li>{s.s5li2}</li>
              <li>{s.s5li3}</li>
              <li>{s.s5li4}</li>
              <li>{s.s5li5}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-fg font-semibold text-base mb-3">{s.s6Title}</h2>
            <p>{s.s6Body}</p>
          </section>

          <section>
            <h2 className="text-fg font-semibold text-base mb-3">{s.s7Title}</h2>
            <p className="mb-2">{s.s7p1}</p>
            <p className="mb-2">{s.s7p2}</p>
            <p>{s.s7p3}</p>
          </section>

          <section>
            <h2 className="text-fg font-semibold text-base mb-3">{s.s8Title}</h2>
            <p>{s.s8Body}</p>
          </section>

          <section>
            <h2 className="text-fg font-semibold text-base mb-3">{s.s9Title}</h2>
            <p>{s.s9Body}</p>
          </section>

          <section>
            <h2 className="text-fg font-semibold text-base mb-3">{s.s10Title}</h2>
            <p>{s.s10Body}</p>
          </section>

          <section>
            <h2 className="text-fg font-semibold text-base mb-3">{s.s11Title}</h2>
            <p>{s.s11Body}</p>
          </section>

          <section>
            <h2 className="text-fg font-semibold text-base mb-3">{s.s12Title}</h2>
            <p>{s.s12Body}{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-fg underline underline-offset-2">
                {SUPPORT_EMAIL}
              </a>
            </p>
          </section>

        </div>
      </div>
    </main>
  );
}
