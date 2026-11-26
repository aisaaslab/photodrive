import Image from "next/image";
import type { Translations } from "@/lib/i18n";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/ui/cn";
import { FeatureCard } from "./FeatureCard";
import { Icon } from "./Icon";

/** Mosaic columns of the gallery card: [photo file, height at sm and up, height on a phone]. */
const COL_1 = [[1, "sm:h-[250px] h-[150px]"], [3, "sm:h-[170px] h-[100px]"]] as const;
const COL_2 = [[2, "sm:h-[170px] h-[100px]"], [4, "sm:h-[250px] h-[150px]"]] as const;

function Mosaic({ items, offset }: { items: readonly (readonly [number, string])[]; offset?: boolean }) {
  return (
    <div className={cn("flex flex-1 flex-col gap-3.5 sm:w-[190px] sm:flex-none", offset && "pt-8 sm:pt-12")}>
      {items.map(([n, h]) => (
        <div key={n} className={cn("relative overflow-hidden rounded-2xl", h)}>
          <Image src={`/landing/gallery-${n}.jpg`} alt="" fill sizes="190px" className="object-cover" />
        </div>
      ))}
    </div>
  );
}

/** Features bento (design node 8:2): a wide gallery card with a photo mosaic, the live-sync card, and six equal cards. */
export function Features({ t }: { t: Translations }) {
  const f = t.features;
  const cards = [
    { icon: "f-maximize", title: f.f2Title, desc: f.f2Desc },
    { icon: "f-heart", title: f.f3Title, desc: f.f3Desc },
    { icon: "f-lock", title: f.f4Title, desc: f.f4Desc },
    { icon: "f-download", title: f.f5Title, desc: f.f5Desc },
    { icon: "f-link", title: f.f6Title, desc: f.f6Desc },
    { icon: "f-globe", title: f.f7Title, desc: f.f7Desc },
  ];
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-4">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-12 px-4 pb-20 pt-4 sm:px-8 lg:gap-14 lg:pb-[120px] xl:px-20">
        <SectionHeader
          eyebrow={f.label}
          title={<span id="features-title">{t.landing.features.title1}<span className="block text-fg-muted">{t.landing.features.title2}</span></span>}
        />
        <div className="flex w-full flex-col gap-5">
          <div className="grid gap-5 lg:grid-cols-[820fr_440fr]">
            <Card hoverable className="flex min-h-[380px] flex-col overflow-hidden p-0 sm:flex-row">
              <div className="flex flex-col gap-3.5 p-8 sm:w-[370px] sm:shrink-0 sm:p-9">
                <span aria-hidden className="grid size-12 place-items-center rounded-[14px] bg-accent-soft"><Icon name="f-image" size={22} /></span>
                <h3 className="text-[28px] font-bold leading-[34px] text-fg sm:max-w-[290px]">{f.f1Title}</h3>
                <p className="text-base leading-[25px] text-fg-muted sm:max-w-[290px]">{f.f1Desc}</p>
              </div>
              <div aria-hidden className="flex max-h-[290px] gap-3.5 overflow-hidden px-8 sm:max-h-none sm:px-0 sm:pt-7">
                <Mosaic items={COL_1} />
                <Mosaic items={COL_2} offset />
              </div>
            </Card>
            <FeatureCard icon="f-refresh" title={f.f8Title} desc={f.f8Desc} className="min-h-[380px]">
              <div className="mt-auto flex items-center justify-center gap-3.5 rounded-2xl bg-surface-2 p-[18px]">
                <Icon name="google-drive-34" size={34} className="h-[30px] w-[34px]" />
                <Icon name="f-refresh-20" size={20} />
                <span aria-hidden className="grid size-11 place-items-center rounded-[12px] bg-accent"><Icon name="f-image-tile" size={22} /></span>
              </div>
            </FeatureCard>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => <FeatureCard key={c.title} {...c} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
