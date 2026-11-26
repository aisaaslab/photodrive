import Link from "next/link";
import type { Translations } from "@/lib/i18n";
import { Accordion, type AccordionItem } from "@/components/ui/Accordion";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";

/** Which of the existing FAQ entries (lib/i18n `faq.questions`, shared with /faq) the landing shows, in the design's order. */
const FROM_FAQ_PAGE = [3, 0] as const; // does the client need an account, where are my photos
const FAQ_AFTER_BILLING = 5; // what happens when I add or remove photos

/** Landing FAQ (design node 8:256): four of the real questions as an accessible accordion, the first open, and a link to all of them. */
export function Faq({ t }: { t: Translations }) {
  const q = t.faq.questions;
  const pick = (i: number): AccordionItem => ({ id: `q${i}`, question: q[i].q, answer: q[i].a });
  const items: AccordionItem[] = [
    ...FROM_FAQ_PAGE.map(pick),
    { id: "billing", question: t.landing.faq.billingQ, answer: t.landing.faq.billingA },
    pick(FAQ_AFTER_BILLING),
  ];
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-4">
      <div className="mx-auto flex max-w-[840px] flex-col items-center gap-10 px-4 pb-20 pt-4 sm:px-8 lg:gap-12 lg:pb-[120px]">
        <SectionHeader eyebrow={t.nav.faq} title={<span id="faq-title">{t.landing.faq.title}</span>} />
        <Accordion items={items} defaultOpen={[items[0].id]} className="w-full" />
        <Button href="/faq" variant="ghost">{t.landing.faq.all}</Button>
      </div>
    </section>
  );
}
