"use client";

import { useState } from "react";
import Link from "next/link";
import { ImageCompareSlider } from "@/components/ImageCompareSlider";
import { LogoLink } from "@/components/LogoLink";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n";
import { TrustSection } from "@/components/TrustSection";
import { DemoForm } from "@/components/demo/DemoForm";
import { DemoVideo } from "@/components/DemoVideo";
import { useAuth } from "@/components/auth/AuthProvider";
import { APP_NAME, DEMO_GALLERY_URL } from "@/lib/branding";


export default function HomePage() {
  const { t, lang } = useLanguage();
  const noAutoRenew = ({
    el: "Î•Ï†Î¬Ï€Î±Î¾ Ï€Î»Î·ÏÏ‰Î¼Î® Â· Ï‡Ï‰ÏÎ¯Ï‚ Î±Ï…Ï„ÏŒÎ¼Î±Ï„Î· Î±Î½Î±Î½Î­Ï‰ÏƒÎ·",
    en: "One-time payment Â· no auto-renewal",
    nl: "Eenmalige betaling Â· geen automatische verlenging",
    de: "Einmalige Zahlung Â· keine automatische VerlÃ¤ngerung",
    es: "Pago Ãºnico Â· sin renovaciÃ³n automÃ¡tica",
    it: "Pagamento unico Â· nessun rinnovo automatico",
  } as Record<string, string>)[lang] ?? "One-time payment Â· no auto-renewal";
  const tutorial = ({
    el: { label: "Tutorial", title: "Î”ÎµÏ‚ Ï„Î¿ PhotoDrive ÏƒÎµ Î´ÏÎ¬ÏƒÎ·." },
    en: { label: "Tutorial", title: "See PhotoDrive in action." },
    nl: { label: "Tutorial", title: "Zie PhotoDrive in actie." },
    de: { label: "Tutorial", title: "PhotoDrive in Aktion." },
    es: { label: "Tutorial", title: "Mira PhotoDrive en acciÃ³n." },
    it: { label: "Tutorial", title: "PhotoDrive in azione." },
  } as Record<string, { label: string; title: string }>)[lang] ?? { label: "Tutorial", title: "See PhotoDrive in action." };
  const { user, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const whatCards = [
    { icon: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3", label: t.what.card1Label, desc: t.what.card1Desc },
    { icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z", label: t.what.card2Label, desc: t.what.card2Desc },
    { icon: "M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75s.168-.75.375-.75S9.75 9.336 9.75 9.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z", label: t.what.card3Label, desc: t.what.card3Desc },
  ];

  const howSteps = [
    { n: "01", title: t.how.step1Title, desc: t.how.step1Desc },
    { n: "02", title: t.how.step2Title, desc: t.how.step2Desc },
    { n: "03", title: t.how.step3Title, desc: t.how.step3Desc, image: "/new-gallery-form.png" },
    { n: "04", title: t.how.step4Title, desc: t.how.step4Desc },
  ];

  const featureCards = [
    { d: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z", title: t.features.f1Title, desc: t.features.f1Desc },
    { d: "M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15", title: t.features.f2Title, desc: t.features.f2Desc },
    { d: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99", title: t.features.f8Title, desc: t.features.f8Desc },
    { d: "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z", title: t.features.f4Title, desc: t.features.f4Desc },
    { d: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3", title: t.features.f5Title, desc: t.features.f5Desc },
    { d: "M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z", title: t.features.f7Title, desc: t.features.f7Desc },
  ];

  const pricingFeatures = [t.pricing.f1, t.pricing.f2, t.pricing.f3, t.pricing.f4, t.pricing.f5, t.pricing.f6, t.pricing.f7];

  return (
    <main className="bg-[#080808] text-white overflow-x-hidden">
      {/* Aurora background */}
      <div className="aurora-bg"><span /></div>

      {/* NAV */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-stone-200 bg-white/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <LogoLink />
          <div className="flex items-center gap-5">
            <a href="#how" className="text-base text-stone-700 hover:text-stone-900 transition-colors hidden sm:block">{t.nav.howItWorks}</a>
            <a href="#features" className="text-base text-stone-700 hover:text-stone-900 transition-colors hidden sm:block">{t.nav.features}</a>
            <a href="#pricing" className="text-base text-stone-700 hover:text-stone-900 transition-colors hidden sm:block">{t.nav.pricing}</a>
            <Link href="/faq" className="text-base text-stone-700 hover:text-stone-900 transition-colors hidden sm:block">{t.nav.faq}</Link>
            <LanguageSwitcher variant="light" />
            {!loading && (
              user ? (
                <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-stone-700 hover:text-stone-900 transition-colors">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold text-stone-700">
                      {user.displayName?.[0] ?? user.email?.[0] ?? "U"}
                    </div>
                  )}
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="text-sm bg-stone-900 text-white font-semibold px-4 py-1.5 rounded-xl hover:bg-stone-800 transition-all hover:scale-[1.02]"
                >
                  {t.nav.login}
                </Link>
              )
            )}
            {/* Hamburger (mobile only) */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="sm:hidden text-stone-800 p-1 -mr-1"
              aria-label="Menu"
              aria-expanded={menuOpen}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                )}
              </svg>
            </button>
          </div>
        </div>
        {/* Mobile menu panel */}
        {menuOpen && (
          <div className="sm:hidden border-t border-stone-200 bg-white/95 backdrop-blur-xl px-6 py-4 flex flex-col gap-4">
            <a href="#how" onClick={() => setMenuOpen(false)} className="text-stone-800 text-base">{t.nav.howItWorks}</a>
            <a href="#features" onClick={() => setMenuOpen(false)} className="text-stone-800 text-base">{t.nav.features}</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)} className="text-stone-800 text-base">{t.nav.pricing}</a>
            <Link href="/faq" onClick={() => setMenuOpen(false)} className="text-stone-800 text-base">{t.nav.faq}</Link>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-20 sm:pt-28 pb-14 sm:pb-20 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_-5%,rgba(244,63,94,0.08),transparent)] pointer-events-none" />

        <div className="relative z-10 max-w-4xl">
          {/* Drive â†’ Gallery badge */}
          <div className="animate-fade-up delay-0 flex items-center justify-center mb-6">
            <div className="inline-flex items-center gap-4 bg-white/[0.05] border border-white/[0.1] rounded-full px-6 py-3">
              <svg viewBox="0 0 87.3 78" className="w-8 h-8 shrink-0" xmlns="http://www.w3.org/2000/svg">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
              </svg>
              <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              <svg className="w-8 h-8 text-[#33A39A] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 12.75V19.5a.75.75 0 00.75.75h16.5a.75.75 0 00.75-.75V4.5a.75.75 0 00-.75-.75H3.75a.75.75 0 00-.75.75v8.25z" />
              </svg>
            </div>
          </div>

          <h1
            className="animate-fade-up delay-1 text-2xl sm:text-3xl lg:text-4xl font-bold leading-[1.05] tracking-tight mb-6"
            style={{ fontFamily: "var(--font-brand), sans-serif" }}
          >
            <span className="text-gradient">{t.hero.title1}</span>
            <br />
            <em className="not-italic text-rose-gradient">{t.hero.title2}</em>
          </h1>

          <p className="animate-fade-up delay-2 text-base sm:text-lg text-white max-w-2xl mx-auto leading-relaxed mb-10">
            {t.hero.subtitle}{" "}
            <span className="text-white font-semibold">{t.hero.subtitleBold}</span>{" "}
            {t.hero.subtitleEnd}
          </p>

          <div className="animate-fade-up delay-3 flex flex-col sm:flex-row items-center justify-center gap-3 mb-3">
            <a
              href="#how"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-white/10 text-white hover:text-white hover:border-white/20 px-8 py-4 rounded-2xl transition-all text-sm"
            >
              {t.hero.howItWorks}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </a>
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-white text-stone-900 font-bold px-8 py-4 rounded-2xl hover:bg-stone-100 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-black/40 text-sm"
            >
              {t.nav.start}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
          {DEMO_GALLERY_URL && (
            <a
              href={DEMO_GALLERY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="animate-fade-up delay-3 inline-flex items-center gap-2.5 border border-white/20 text-white text-base font-medium px-7 py-3 rounded-full hover:bg-white/10 hover:border-white/40 transition-all"
            >
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
              {t.hero.seeExample}
            </a>
          )}

          <div className="animate-fade-up delay-3 flex flex-col sm:flex-row items-center justify-center gap-x-6 gap-y-2 mt-6 text-sm text-white/60">
            {[t.hero.bullet1, t.hero.bullet2, t.hero.bullet3].map((b) => (
              <span key={b} className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-[#33A39A] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {b}
              </span>
            ))}
          </div>

        </div>

        {/* Slider */}
        <div className="animate-fade-up delay-5 relative z-10 w-full max-w-4xl mt-20">
          <div className="absolute -inset-8 bg-[#2D6A6A]/[0.04] rounded-3xl blur-3xl pointer-events-none" />
          <p className="text-center text-white uppercase text-base font-semibold mb-6 tracking-wide">{t.hero.sliderLabel}</p>
          <ImageCompareSlider
            after="/slider-drive.jpg"
            before="/slider-gallery.jpg"
            afterLabel="Google Drive"
            beforeLabel={APP_NAME}
          />
        </div>
      </section>

      {/* DEMO */}
      <DemoForm />

      {/* DEMO VIDEO */}
      <DemoVideo label={tutorial.label} title={tutorial.title} />

      {/* WHAT IS IT */}
      <section className="py-16 sm:py-28 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <p className="text-base font-semibold tracking-[0.2em] uppercase text-white mb-5">{t.what.label}</p>
            <h2
              className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight text-gradient mb-6"
              style={{ fontFamily: "var(--font-brand), sans-serif" }}
            >
              {t.what.title1}{" "}
              <em className="not-italic text-rose-gradient">{t.what.title2}</em>
            </h2>
            <p className="text-white text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
              {t.what.p1}
              <br /><br />
              {t.what.p2}
              <br /><br />
              {t.what.p3}
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {whatCards.map(({ icon, label, desc }) => (
              <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 flex flex-col items-center text-center">
                <div className="w-10 h-10 bg-[#2D6A6A]/10 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-[#33A39A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-white mb-1.5" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{label}</h3>
                <p className="text-base text-white leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-16 sm:py-28 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <p className="text-base font-semibold tracking-[0.2em] uppercase text-white mb-5">{t.how.label}</p>
            <h2
              className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight text-gradient"
              style={{ fontFamily: "var(--font-brand), sans-serif" }}
            >
              {t.how.title1}{" "}
              <em className="not-italic text-rose-gradient">{t.how.title2}</em>
            </h2>
            <p className="mt-4 text-white text-lg max-w-xl mx-auto leading-relaxed">
              {t.how.subtitle}
            </p>
          </div>

          <div className="space-y-4">
            {howSteps.map(({ n, title, desc, image }: { n: string; title: string; desc: string; image?: string }) => (
              <div
                key={n}
                className="card-shimmer border border-white/[0.06] rounded-2xl p-6 sm:p-8 bg-white/[0.02] hover:bg-white/[0.04] transition-colors flex gap-6 items-start"
              >
                <span className="text-3xl font-bold text-[#33A39A] shrink-0 w-10 text-right" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{n}</span>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white mb-1.5">{title}</h3>
                  <p className="text-lg text-white leading-relaxed">{desc}</p>
                  {image && (
                    <div className="mt-5 rounded-xl overflow-hidden shadow-2xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt={title} className="w-full" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-16 sm:py-28 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <p className="text-base font-semibold tracking-[0.2em] uppercase text-white mb-5">{t.features.label}</p>
            <h2
              className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gradient leading-tight"
              style={{ fontFamily: "var(--font-brand), sans-serif" }}
            >
              {t.features.title}
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {featureCards.map(({ d, title, desc }) => (
              <div
                key={title}
                className="card-shimmer border border-white/[0.05] rounded-2xl p-6 bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-300 hover:border-white/10 flex flex-col items-center text-center"
              >
                <div className="w-9 h-9 border border-white/30 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
                  </svg>
                </div>
                <h3 className="font-semibold text-white text-lg mb-2">{title}</h3>
                <p className="text-base text-white leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY / TRUST */}
      <TrustSection />

      {/* PRICING */}
      <section id="pricing" className="py-16 sm:py-28 px-6 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <p className="text-base font-semibold tracking-[0.2em] uppercase text-white mb-5">{t.pricing.label}</p>
            <h2
              className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gradient leading-tight"
              style={{ fontFamily: "var(--font-brand), sans-serif" }}
            >
              {t.pricing.title}
            </h2>
          </div>

          <div className="max-w-sm mx-auto">
            <div className="relative border border-[#2D6A6A]/25 rounded-2xl p-8 bg-gradient-to-b from-[#2D6A6A]/15 to-transparent overflow-hidden text-center">
              <p className="text-sm font-bold tracking-widest uppercase text-[#33A39A] mb-5">{t.pricing.badge}</p>
              <div className="flex flex-col items-center justify-center mb-1">
                <span className="text-5xl font-bold text-white">â‚¬89</span>
              </div>
              <p className="text-white text-lg font-medium mb-2">{t.pricing.vatNote}</p>
              <p className="flex items-center justify-center gap-1.5 text-white/50 text-xs mb-7">
                <svg className="w-3.5 h-3.5 text-[#33A39A] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                {noAutoRenew}
              </p>
              <ul className="space-y-3 mb-8 inline-flex flex-col items-start">
                {pricingFeatures.map((f, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-base text-white">
                    <svg className="w-3.5 h-3.5 text-[#33A39A] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/subscribe"
                className="block w-full text-center bg-white text-stone-900 font-bold rounded-xl py-3.5 text-sm hover:bg-stone-100 transition-all hover:scale-[1.01] shadow-lg shadow-black/20"
              >
                {t.pricing.cta}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-32 px-6 border-t border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,rgba(244,63,94,0.07),transparent)] pointer-events-none" />
        <div className="relative max-w-2xl mx-auto text-center">
          <h2
            className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight mb-6"
            style={{ fontFamily: "var(--font-brand), sans-serif" }}
          >
            <span className="text-gradient">{t.cta.title1}</span>
            <br />
            <em className="not-italic text-rose-gradient">{t.cta.title2}</em>
          </h2>
          <p className="text-white text-lg mb-10 leading-relaxed max-w-lg mx-auto">
            {t.cta.subtitle}
          </p>
          <Link
            href="/subscribe"
            className="inline-flex items-center gap-3 bg-white text-stone-900 font-bold px-10 py-4 rounded-2xl hover:bg-stone-100 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-black/50 text-base"
          >
            {t.cta.btn}
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-bold text-white text-lg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
            {APP_NAME}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-white">
            <Link href="/faq" className="hover:text-white transition-colors">{t.nav.faq}</Link>
            <Link href="/terms" className="hover:text-white transition-colors">{t.footer.terms}</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">{t.footer.privacy}</Link>
            <Link href="/contact" className="hover:text-white transition-colors">{t.footer.contact}</Link>
            <LanguageSwitcher />
          </div>
          <span className="text-sm text-white">Â© {new Date().getFullYear()} {APP_NAME}</span>
        </div>
      </footer>

    </main>
  );
}
