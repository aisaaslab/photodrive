import Link from "next/link";
import type { Translations } from "@/lib/i18n";
import { APP_NAME } from "@/lib/branding";
import { Logo } from "@/components/ui/Logo";
import { LanguageMenu } from "./LanguageMenu";

/** Footer (design node 8:296): logo and tagline, three link columns, copyright and the language menu. */
export function Footer({ t }: { t: Translations }) {
  const f = t.landing.footer;
  const columns = [
    { title: f.product, links: [{ href: "/#how", label: t.nav.howItWorks }, { href: "/#features", label: t.nav.features }, { href: "/#pricing", label: t.nav.pricing }] },
    { title: f.support, links: [{ href: "/faq", label: t.nav.faq }, { href: "/contact", label: t.footer.contact }] },
    { title: f.legal, links: [{ href: "/terms", label: t.footer.terms }, { href: "/privacy", label: t.footer.privacy }] },
  ];
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-14 sm:px-8 lg:pt-16 xl:px-20">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="flex max-w-[340px] flex-col gap-4">
            <Logo className="self-start" />
            <p className="text-[15px] leading-[23px] text-fg-muted">{f.tagline}</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-3 lg:gap-x-20">
            {columns.map((c) => (
              <div key={c.title} className="flex flex-col gap-3.5">
                <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-fg-muted">{c.title}</h2>
                <ul className="flex flex-col gap-3">
                  {c.links.map((l) => <li key={l.href}><Link href={l.href} className="text-[15px] text-fg-soft transition-colors hover:text-fg">{l.label}</Link></li>)}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 lg:mt-[48px]">
          <p className="text-sm text-fg-muted">{f.copyright.replace("{year}", String(new Date().getFullYear())).replace("{name}", APP_NAME)}</p>
          <LanguageMenu variant="footer" direction="up" />
        </div>
      </div>
    </footer>
  );
}
