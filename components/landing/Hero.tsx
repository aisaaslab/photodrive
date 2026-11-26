import Image from "next/image";
import type { Translations } from "@/lib/i18n";
import { DEMO_GALLERY_URL } from "@/lib/branding";
import { Button } from "@/components/ui/Button";
import { GalleryWindow } from "./GalleryWindow";
import { Icon } from "./Icon";

/**
 * Hero copy and the product preview (design node 5:14; the nav that sits over it is rendered by the page, outside `main`). The photo sits under two gradients (left to right and top to bottom) and the
 * preview fades into the page at the bottom. Server-rendered in the visitor's language; only the nav is a client island.
 */
export function Hero({ t }: { t: Translations }) {
  const h = t.landing.hero;
  return (
    <section id="top" className="relative isolate overflow-hidden bg-canvas">
      <Image src="/landing/hero.webp" alt="" fill priority sizes="100vw" quality={80} className="-z-20 object-cover object-[60%_center]" />
      <div
        aria-hidden className="absolute inset-0 -z-10"
        style={{ backgroundImage: "linear-gradient(180deg, rgba(6,8,12,0) 40%, rgb(6,8,12) 100%), linear-gradient(90deg, rgba(6,8,12,0.92) 0%, rgba(6,8,12,0.55) 60%, rgba(6,8,12,0.25) 100%)" }}
      />

      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-6 px-4 pt-32 text-center sm:px-8 sm:gap-7 lg:pt-44 xl:px-20">
        <p className="inline-flex max-w-full items-center gap-2.5 rounded-pill border border-line bg-glass px-4 py-2.5 text-[13px] font-medium text-fg sm:gap-3 sm:px-5 sm:text-sm">
          <Icon name="google-drive" size={20} className="h-[18px] w-5 shrink-0" />
          <span className="whitespace-nowrap">{h.badgeDrive}</span>
          <Icon name="arrow-right-accent-16" size={16} className="shrink-0" />
          <Icon name="image-accent-18" size={18} className="shrink-0" />
          <span className="font-semibold">{h.badgeGallery}</span>
        </p>
        <h1 className="text-h1 max-w-[16ch] font-extrabold text-fg text-balance sm:max-w-none">
          {t.hero.title1}
          <span className="text-accent-gradient block pb-[0.12em]">{t.hero.title2}</span>
        </h1>
        <p className="text-lead max-w-[700px] text-fg-soft text-pretty">{h.lead}</p>
        <div className="flex w-full flex-col items-center gap-3.5 sm:w-auto sm:flex-row">
          <Button
            href="/login" size="lg" iconRight={<Icon name="arrow-right-dark-18" size={18} />}
            className="h-[58px] w-full px-[30px] shadow-[0_10px_20px_rgba(46,171,224,0.45)] sm:w-auto"
          >
            {h.ctaPrimary}
          </Button>
          <Button
            href={DEMO_GALLERY_URL || "#try-it"} variant="glass" size="lg"
            {...(DEMO_GALLERY_URL ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="h-[56px] w-full px-7 sm:w-auto"
          >
            {h.ctaDemo}
          </Button>
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-sm font-medium text-fg-soft">
          {[t.hero.bullet1, t.hero.bullet2, t.hero.bullet3].map((b) => (
            <li key={b} className="inline-flex items-center gap-[7px]"><Icon name="check-accent-16" size={16} />{b}</li>
          ))}
        </ul>
      </div>

      <GalleryWindow t={t} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[200px] bg-gradient-to-b from-transparent to-canvas to-95% lg:h-[280px]" />
    </section>
  );
}
