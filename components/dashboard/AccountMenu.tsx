"use client";

import Link from "next/link";
import { ChevronDown, ImageIcon, LogOut, UserRound } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cn, focusRing } from "@/lib/ui/cn";
import { usePopoverMenu } from "./gallery-card/usePopoverMenu";

/**
 * The account menu in the dashboard header (S5-12): the photographer's avatar opens a small menu with their name and e-mail, the
 * account page, a way to change the photo and sign out. It replaces four separate controls in the header (account link, avatar, name,
 * sign out), which on a phone left no room for the logo.
 */
export function AccountMenu({
  name, email, avatarUrl, onEditPhoto, onSignOut,
}: {
  name: string; email?: string | null; avatarUrl: string | null; onEditPhoto: () => void; onSignOut: () => void;
}) {
  const { t } = useLanguage();
  const { menuOpen, setMenuOpen, menuRef } = usePopoverMenu();
  const item = cn("flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-fg-soft transition-colors hover:bg-surface hover:text-fg", focusRing);
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label={t.dashboardLayout.account}
        className={cn("flex items-center gap-1.5 rounded-pill border border-line bg-surface py-1 pl-1 pr-2.5 transition-colors hover:border-fg-muted/40", focusRing)}
      >
        {avatarUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={avatarUrl} alt="" className="size-8 rounded-full object-cover" />
          : <span aria-hidden className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{(name || "?")[0].toUpperCase()}</span>}
        <ChevronDown aria-hidden className={cn("size-3.5 text-fg-muted transition-transform", menuOpen && "rotate-180")} />
      </button>
      {menuOpen && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-card border border-line bg-surface-2 shadow-chip animate-scale-in">
          <div className="border-b border-line px-3.5 py-3">
            <p className="truncate text-sm font-bold text-fg">{name}</p>
            {email && <p className="truncate text-xs text-fg-muted">{email}</p>}
          </div>
          <div className="py-1">
            <Link href="/dashboard/account" role="menuitem" className={item} onClick={() => setMenuOpen(false)}>
              <UserRound aria-hidden className="size-4" />{t.dashboardLayout.account}
            </Link>
            <button type="button" role="menuitem" className={item} onClick={() => { setMenuOpen(false); onEditPhoto(); }}>
              <ImageIcon aria-hidden className="size-4" />{t.dashboardLayout.changePhoto}
            </button>
            <button type="button" role="menuitem" className={cn(item, "hover:text-danger")} onClick={() => { setMenuOpen(false); onSignOut(); }}>
              <LogOut aria-hidden className="size-4" />{t.dashboardLayout.signOut}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
