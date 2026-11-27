"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Mail, MessageCircle } from "lucide-react";
import type { GalleryDoc } from "@/lib/firestore/types";
import { isPrivate } from "@/lib/gallery/visibility";
import { galleryUrl } from "@/lib/gallery/gallery-settings";
import { useLanguage } from "@/lib/i18n";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn, focusRing } from "@/lib/ui/cn";

/**
 * Shown right after a gallery is created (S5-12): the link is the next thing a photographer needs, so it is ready to copy, open or send
 * by e-mail or WhatsApp, together with the password for a private gallery. Before, creating a gallery only added a card to the list.
 */
export function GalleryCreatedModal({ gallery, onClose }: { gallery: GalleryDoc; onClose: () => void }) {
  const { t } = useLanguage();
  const f = t.newGalleryForm;
  const c = t.galleryCard;
  const url = galleryUrl(gallery);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { /* clipboard unavailable */ }
  }
  const secondary = cn("inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-pill border border-line px-4 text-sm font-semibold text-fg-soft transition-colors hover:border-fg-muted/40 hover:text-fg", focusRing);
  return (
    <Modal ariaLabel={f.createdTitle} onClose={onClose} className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-window animate-scale-in sm:p-7">
      <div className="text-center">
        <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-full bg-success-bright/15 text-success-bright"><Check className="size-6" strokeWidth={2.5} /></span>
        <h3 className="mt-4 text-xl font-extrabold text-fg">{f.createdTitle}</h3>
        <p className="mt-1 text-sm text-fg-muted">{gallery.name}</p>
        <p className="mt-4 text-sm text-fg-soft">{f.createdHint}</p>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-tile border border-line bg-canvas p-1.5 pl-3.5">
        <input readOnly value={url} aria-label={c.copyLink} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent text-sm text-fg-soft outline-none" />
        <Button size="sm" onClick={copy} iconLeft={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>{copied ? c.copied : c.copyLink}</Button>
      </div>
      {isPrivate(gallery) && gallery.password && (
        <p className="mt-3 rounded-tile bg-surface-2 px-3.5 py-2.5 text-sm text-fg-soft">
          {c.password}: <span className="font-mono font-bold tracking-wider text-fg">{gallery.password}</span>
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <a className={secondary} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden className="size-4" />{c.openGallery}</a>
        <a className={secondary} href={`mailto:?subject=${encodeURIComponent(gallery.name)}&body=${encodeURIComponent(url)}`}><Mail aria-hidden className="size-4" />{c.sendByEmail}</a>
      </div>
      <a className={cn(secondary, "mt-2 w-full")} href={`https://wa.me/?text=${encodeURIComponent(`${gallery.name} ${url}`)}`} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden className="size-4" />{c.sendOnWhatsapp}</a>
      <Button variant="ghost" onClick={onClose} className="mt-3 w-full">{f.createdDone}</Button>
    </Modal>
  );
}
