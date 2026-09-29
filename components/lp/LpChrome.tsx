import Image from "next/image";
import Link from "next/link";
import { APP_NAME } from "@/lib/branding";
import { LpCta } from "./LpCta";

export type NavLink = { label: string; href: string };

/** Shared sticky nav for landing-page variants. `lp` labels CTA tracking events. */
export function LpNav({ lp, links }: { lp: string; links: NavLink[] }) {
  return (
    <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" aria-label={`${APP_NAME} home`}>
          <Image src="/logo.png" alt={APP_NAME} width={240} height={56} className="h-10 w-auto" priority />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-stone-600 md:flex" aria-label="Page sections">
          {links.map((l) =>
            l.href.startsWith("#") ? (
              <a key={l.label} href={l.href} className="hover:text-stone-900">{l.label}</a>
            ) : (
              <Link key={l.label} href={l.href} className="hover:text-stone-900">{l.label}</Link>
            )
          )}
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/login" className="hidden text-sm font-medium text-stone-700 hover:text-stone-900 sm:block">Log In</Link>
          <LpCta lp={lp} placement="nav" className="!px-4 !py-2.5">
            <span className="sm:hidden">Start Free</span>
            <span className="hidden sm:inline">Create Your Free Gallery</span>
          </LpCta>
        </div>
      </div>
    </header>
  );
}

export function LpFooter() {
  return (
    <footer className="border-t border-stone-200 px-5 py-6 text-sm text-stone-500">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <span>© {new Date().getFullYear()} {APP_NAME}</span>
        <div className="flex gap-5">
          <Link href="/faq" className="hover:text-stone-800">FAQ</Link>
          <Link href="/terms" className="hover:text-stone-800">Terms</Link>
          <Link href="/privacy" className="hover:text-stone-800">Privacy</Link>
          <Link href="/contact" className="hover:text-stone-800">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
