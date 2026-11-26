import Image from "next/image";
import type { Translations } from "@/lib/i18n";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/ui/cn";
import { Icon } from "./Icon";

const THUMBS = ["gallery-2", "gallery-1", "hero", "gallery-5", "gallery-4"];

function ScrimButton({ icon, className }: { icon: string; className?: string }) {
  return <span aria-hidden className={cn("absolute grid size-11 place-items-center rounded-full bg-scrim", className)}><Icon name={icon} size={20} /></span>;
}

/** Client experience (design node 8:100): a mock of the full-screen viewer next to the copy and three bullets. The mock is decorative. */
export function ClientExperience({ t }: { t: Translations }) {
  const c = t.landing.client;
  const bullets = [{ icon: "c-heart", text: c.b1 }, { icon: "c-maximize", text: c.b2 }, { icon: "c-download", text: c.b3 }];
  return (
    <section aria-labelledby="client-title">
      <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-4 pb-20 pt-2 sm:px-8 lg:grid-cols-[700px_1fr] lg:gap-16 lg:pb-[120px] lg:pt-10 xl:px-20">
        <div role="img" aria-label={c.lightbox} className="relative aspect-[7/5] w-full overflow-hidden rounded-[28px] border border-line">
          <Image src="/landing/hero.jpg" alt="" fill sizes="(min-width: 1024px) 700px, 100vw" className="object-cover" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-b from-transparent to-canvas/85" />
          <ScrimButton icon="c-heart-btn" className="right-[72px] top-5" />
          <ScrimButton icon="c-download-btn" className="right-5 top-5" />
          <ScrimButton icon="c-arrow-left" className="left-5 top-1/2 -translate-y-1/2" />
          <ScrimButton icon="c-arrow-right" className="right-5 top-1/2 -translate-y-1/2" />
          <div aria-hidden className="absolute inset-x-0 bottom-5 flex justify-center gap-2.5 sm:bottom-7">
            {THUMBS.map((n, i) => (
              <span key={n} className={cn("relative h-[52px] w-[74px] overflow-hidden rounded-[10px]", i === 2 ? "border-2 border-accent" : "opacity-70", (i === 0 || i === 4) && "hidden sm:block")}>
                <Image src={`/landing/${n}.jpg`} alt="" fill sizes="74px" className="object-cover" />
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-start gap-6">
          <Pill>{c.label}</Pill>
          <h2 id="client-title" className="text-h2-compact max-w-[480px] font-extrabold text-fg text-balance">
            {c.title1} <span className="text-accent">{c.title2}</span>
          </h2>
          <p className="text-lead max-w-[460px] text-fg-muted">{c.lead}</p>
          <ul className="flex flex-col gap-4">
            {bullets.map((b) => (
              <li key={b.text} className="flex items-center gap-3.5 text-[17px] font-semibold text-fg">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-accent-soft"><Icon name={b.icon} size={19} /></span>
                {b.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
