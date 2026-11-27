import type { Translations } from "@/lib/i18n";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { Icon } from "./Icon";

/** Four equal-height step cards joined by arrows (design node 5:166). Arrows show only when the four cards share one row (lg). */
export function HowItWorks({ t }: { t: Translations }) {
  const steps = [
    { title: t.how.step1Title, desc: t.landing.how.step1 },
    { title: t.how.step2Title, desc: t.landing.how.step2 },
    { title: t.how.step3Title, desc: t.landing.how.step3 },
    { title: t.how.step4Title, desc: t.landing.how.step4 },
  ];
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-4">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-12 px-4 py-20 sm:px-8 lg:gap-16 lg:py-[120px] xl:px-20">
        <SectionHeader
          eyebrow={t.how.label}
          title={<span id="how-title">{t.how.title1} <span className="text-accent">{t.how.title2}</span></span>}
          lead={t.how.subtitle}
        />
        <ol className="grid w-full gap-3 sm:grid-cols-2 lg:flex lg:items-stretch">
          {steps.map((s, i) => (
            <li key={i} className="contents">
              <Card className="flex flex-col gap-[18px] p-7 lg:flex-1">
                <span aria-hidden className="grid size-11 place-items-center rounded-full bg-accent-soft text-base font-extrabold text-accent">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="text-[19px] font-bold leading-[25px] text-fg">{s.title}</h3>
                <p className="text-[15px] leading-[23px] text-fg-muted">{s.desc}</p>
              </Card>
              {i < steps.length - 1 && <span aria-hidden className="hidden shrink-0 self-center lg:block"><Icon name="arrow-right-deep-20" size={20} /></span>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
