import type { Translations } from "@/lib/i18n";
import { Chip } from "@/components/ui/Chip";

/** "Built for" strip under the hero: a label and five genre chips (design node 5:149). */
export function BuiltFor({ t }: { t: Translations }) {
  const b = t.landing.builtFor;
  const chips = [b.weddings, b.portraits, b.events, b.sports, b.corporate];
  return (
    <section aria-label={b.label} className="border-t border-line">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-center gap-x-3.5 gap-y-3 px-4 py-8 sm:px-8 lg:py-10 xl:px-20">
        <p className="w-full text-center text-sm font-semibold uppercase tracking-[0.08em] text-fg-muted sm:w-auto">{b.label}</p>
        <ul className="flex flex-wrap items-center justify-center gap-3.5">
          {chips.map((c) => <li key={c}><Chip>{c}</Chip></li>)}
        </ul>
      </div>
    </section>
  );
}
