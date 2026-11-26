import Image from "next/image";
import type { Translations } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Icon } from "./Icon";

/** Closing call to action (design node 8:286): a photo panel under a left-to-right dark gradient with the headline and one button. */
export function FinalCta({ t }: { t: Translations }) {
  return (
    <section aria-labelledby="cta-title">
      <div className="mx-auto max-w-[1440px] px-4 pb-16 sm:px-8 lg:pb-[100px] xl:px-20">
        <div className="relative isolate flex min-h-[420px] items-center overflow-hidden rounded-[28px] border border-line px-6 py-14 sm:px-12 lg:min-h-[440px] lg:rounded-[36px] lg:px-[72px]">
          <Image src="/landing/gallery-6.webp" alt="" fill sizes="(min-width: 1280px) 1280px, 100vw" className="-z-20 object-cover" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-canvas/95 via-canvas/80 via-50% to-canvas/10 max-sm:from-canvas/90 max-sm:via-canvas/80 max-sm:to-canvas/60" />
          <div className="flex w-full max-w-[600px] flex-col items-start gap-[22px]">
            <h2 id="cta-title" className="text-h2 font-extrabold text-fg">
              {t.cta.title1}<span className="block text-accent">{t.cta.title2}</span>
            </h2>
            <p className="text-lead max-w-[460px] text-fg-soft">{t.cta.subtitle}</p>
            <Button href="/login" size="lg" iconRight={<Icon name="arrow-right-dark-18" size={18} />} className="h-[58px] px-8 shadow-[0_10px_20px_rgba(46,171,224,0.45)]">
              {t.landing.hero.ctaPrimary}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
