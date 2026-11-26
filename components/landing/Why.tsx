import { Link2, ShieldCheck, Users, CircleCheck } from "lucide-react";
import type { Translations } from "@/lib/i18n";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { IconTile } from "@/components/ui/IconTile";
import { Card } from "@/components/ui/Card";

/**
 * "Why PhotoDrive": four trust cards (not in the Figma file; designed from its tokens, D14). The wording makes no promise about how
 * long a gallery link stays live or about renewals beyond what the billing model does (D3, S9-07).
 */
export function Why({ t }: { t: Translations }) {
  const w = t.landing.why;
  const cards = [
    { icon: <ShieldCheck />, title: w.c1t, text: w.c1 },
    { icon: <Users />, title: w.c2t, text: w.c2 },
    { icon: <Link2 />, title: w.c3t, text: w.c3 },
    { icon: <CircleCheck />, title: w.c4t, text: w.c4 },
  ];
  return (
    <section aria-labelledby="why-title">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-12 px-4 pb-20 sm:px-8 lg:gap-14 lg:pb-[120px] xl:px-20">
        <SectionHeader eyebrow={w.label} title={<span id="why-title">{w.title}</span>} />
        <ul className="grid w-full gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <li key={c.title} className="contents">
              <Card hoverable className="flex flex-col gap-3.5 p-7">
                <IconTile>{c.icon}</IconTile>
                <h3 className="text-xl font-bold leading-[26px] text-fg">{c.title}</h3>
                <p className="text-[15px] leading-[23px] text-fg-muted">{c.text}</p>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
