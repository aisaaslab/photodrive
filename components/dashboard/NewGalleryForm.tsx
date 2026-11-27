"use client";

import type { Visibility } from "@/lib/gallery/visibility";
import type { GalleryDoc } from "@/lib/firestore/types";
import { GalleryFields } from "./new-gallery/GalleryFields";
import { VisibilityField } from "./new-gallery/VisibilityField";
import { SocialLinksField } from "./new-gallery/SocialLinksField";
import { PaymentStep } from "./new-gallery/PaymentStep";
import { useNewGalleryForm } from "./new-gallery/useNewGalleryForm";

interface Props {
  onCreated: (gallery: GalleryDoc) => void;
  onCancel?: () => void;
  initialData?: { name: string; driveUrl: string; password: string; visibility?: Visibility; website?: string; instagram?: string; facebook?: string; description?: string; eventDate?: string; location?: string };
  /** After payment, auto-submit the restored form once the subscription is active. */
  autoSubmit?: boolean;
}

/**
 * The dashboard's "new gallery" form. The pieces live in new-gallery/ (S5-09): the form's state and flow (useNewGalleryForm, with the
 * subscription gate and the post-payment auto-submit), the payment step, and the sections of the form. What is sent is decided by the
 * pure functions in lib/gallery/new-gallery.ts.
 */
export function NewGalleryForm({ onCreated, onCancel, initialData, autoSubmit }: Props) {
  const form = useNewGalleryForm({ onCreated, initialData, autoSubmit });
  const { f, error, loading, showPayment, checkoutLoading, payment, setShowPayment, handleSubmit, handleCheckout } = form;

  if (showPayment) {
    return (
      <PaymentStep payment={payment} error={error} checkoutLoading={checkoutLoading} onBack={() => setShowPayment(false)} onCheckout={handleCheckout} />
    );
  }

  return (
    <div className="bg-surface border border-line rounded-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-line">
        <div>
          <h2 className="font-semibold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{f.title}</h2>
          <p className="text-xs text-fg-muted mt-0.5">{f.subtitle}</p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            aria-label={f.cancel}
            className="w-8 h-8 flex items-center justify-center rounded-full text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <GalleryFields form={form} />
        <VisibilityField form={form} />
        <SocialLinksField form={form} />

        {error && (
          <div className="flex items-center gap-2 text-sm text-danger bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 border border-line text-fg rounded-xl py-2.5 text-sm font-medium hover:bg-surface transition-colors"
            >
              {f.cancel}
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-accent text-canvas rounded-pill py-2.5 text-sm font-medium hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-canvas/30 border-t-canvas rounded-full animate-spin" />
                {f.creating}
              </>
            ) : (
              f.create
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
