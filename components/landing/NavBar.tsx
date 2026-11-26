"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { APP_NAME } from "@/lib/branding";
import { Button } from "@/components/ui/Button";
import { cn, focusRing } from "@/lib/ui/cn";
import { LanguageMenu } from "./LanguageMenu";

/** The original PhotoDrive logo (folder, camera lens, wordmark), in the version made for dark backgrounds. */
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return <Image src="/logo-light.png" alt={APP_NAME} width={735} height={200} priority={priority} className={cn("h-10 w-auto sm:h-11", className)} />;
}

const LINKS = [
  { href: "#how", key: "howItWorks" },
  { href: "#features", key: "features" },
  { href: "#pricing", key: "pricing" },
  { href: "#faq", key: "faq" },
] as const;

/**
 * The landing navigation (client island: it knows whether the visitor is signed in, and owns the language menu and the phone menu).
 * From `lg` it is the design's bar (logo, four links, language, Log in, Get started); below that the links move into a menu opened by
 * a button with `aria-expanded`. The menu closes on Escape and when a link is chosen.
 */
export function NavBar() {
  const { t } = useLanguage();
  const { user, profile, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const initial = (profile?.name || user?.displayName || user?.email || "U")[0]?.toUpperCase();
  const photo = profile?.photoURL || user?.photoURL;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const account = !loading && (user ? (
    <Link href="/dashboard" aria-label="Dashboard" className={cn("rounded-full", focusRing)}>
      {photo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={photo} alt="" className="size-9 rounded-full object-cover" referrerPolicy="no-referrer" />
        : <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-sm font-bold text-fg">{initial}</span>}
    </Link>
  ) : (
    <>
      <Link href="/login" className={cn("hidden rounded-pill px-1 text-[15px] font-semibold text-fg sm:inline", focusRing)}>{t.landing.nav.login}</Link>
      <Button href="/login" size="sm" className="sm:h-[42px] sm:px-[22px] sm:text-[15px]">{t.nav.start}</Button>
    </>
  ));

  return (
    <header className="absolute inset-x-0 top-0 z-40">
      <nav aria-label={t.landing.nav.primary} className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-5 sm:px-8 lg:py-7 xl:px-20">
        <Link href="/" className={cn("rounded-tile", focusRing)}><Logo priority /></Link>
        <ul className="hidden items-center gap-9 text-[15px] font-medium text-fg-soft lg:flex">
          {LINKS.map((l) => <li key={l.key}><a href={l.href} className={cn("rounded-pill transition-colors hover:text-fg", focusRing)}>{t.nav[l.key]}</a></li>)}
        </ul>
        <div className="flex items-center gap-3.5 sm:gap-5">
          <div className="hidden sm:block"><LanguageMenu /></div>
          {account}
          <button
            type="button" aria-expanded={open} aria-controls="landing-menu" aria-label={open ? t.landing.nav.closeMenu : t.landing.nav.menu}
            onClick={() => setOpen((v) => !v)}
            className={cn("grid size-10 place-items-center rounded-full text-fg lg:hidden", focusRing)}
          >
            {open ? <X aria-hidden className="size-6" /> : <Menu aria-hidden className="size-6" />}
          </button>
        </div>
      </nav>
      {open && (
        <div id="landing-menu" className="mx-4 rounded-card border border-line bg-surface/95 p-3 shadow-chip backdrop-blur-xl sm:mx-8 lg:hidden">
          <ul className="flex flex-col">
            {LINKS.map((l) => (
              <li key={l.key}>
                <a href={l.href} onClick={() => setOpen(false)} className={cn("block rounded-tile px-4 py-3 text-base font-semibold text-fg-soft hover:bg-glass hover:text-fg", focusRing)}>{t.nav[l.key]}</a>
              </li>
            ))}
            {!loading && !user && <li><Link href="/login" onClick={() => setOpen(false)} className={cn("block rounded-tile px-4 py-3 text-base font-semibold text-fg-soft hover:bg-glass hover:text-fg sm:hidden", focusRing)}>{t.landing.nav.login}</Link></li>}
          </ul>
          <div className="mt-1 border-t border-line px-3 pt-3 sm:hidden"><LanguageMenu variant="footer" direction="down" align="left" /></div>
        </div>
      )}
    </header>
  );
}
