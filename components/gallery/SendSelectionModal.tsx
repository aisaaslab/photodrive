"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useLanguage } from "@/lib/i18n";

/**
 * "Send my selection" dialog on the public gallery. The client's favorites are
 * already shared live; this lets them say "I'm done" — name (required), email
 * and a note (optional) — and notifies the photographer.
 */
interface Props {
  galleryId: string;
  count: number;
  onClose: () => void;
  /** Called once the selection is saved; `downloadsLocked` is true when the photographer switches downloads off after sending (S9-06). */
  onSent?: (result: { downloadsLocked: boolean }) => void;
}

const NAME_KEY = "send_selection_name";
const EMAIL_KEY = "send_selection_email";

function remembered(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function SendSelectionModal({ galleryId, count, onClose, onSent }: Props) {
  const { t } = useLanguage();
  const g = t.gallery;
  const [name, setName] = useState(() => remembered(NAME_KEY));
  const [email, setEmail] = useState(() => remembered(EMAIL_KEY));
  const [note, setNote] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError(g.sendNameRequired);
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/galleries/${galleryId}/selection/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, note, website: honeypot }),
      });
      if (!res.ok) throw new Error();
      const result = (await res.json().catch(() => ({}))) as { downloadsLocked?: boolean };
      onSent?.({ downloadsLocked: result.downloadsLocked === true });
      try {
        localStorage.setItem(NAME_KEY, name.trim());
        localStorage.setItem(EMAIL_KEY, email.trim());
      } catch {
        // private mode — fine
      }
      setSent(true);
    } catch {
      setError(g.sendError);
    } finally {
      setSending(false);
    }
  }

  const field =
    "w-full bg-surface border border-line rounded-xl px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-muted outline-none focus:ring-2 focus:ring-accent-deep/40 focus:border-accent-deep/50 transition-all";

  return (
    <Modal
      onClose={onClose}
      ariaLabel={g.sendTitle}
      className="bg-canvas border border-line rounded-card shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
    >
      {sent ? (
        <div className="p-7 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-100 text-success-bright flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-fg">{g.sendThanks}</h2>
          <p className="text-sm text-fg-muted mt-1.5 leading-relaxed">{g.sendThanksBody}</p>
          <button
            onClick={onClose}
            className="mt-6 w-full bg-accent text-canvas rounded-pill py-3 text-sm font-semibold hover:bg-surface-2 transition-colors"
          >
            {g.sendDone}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-fg">{g.sendTitle}</h2>
            <p className="text-sm text-fg-muted mt-1 leading-relaxed">
              <span className="font-semibold text-fg">
                {count} {count === 1 ? g.photo : g.photos}
              </span>
              {" · "}
              {g.sendIntro}
            </p>
          </div>

          <div>
            <label htmlFor="sel-name" className="text-xs font-medium text-fg-soft mb-1 block">{g.yourName}</label>
            <input id="sel-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={100} className={field} />
          </div>
          <div>
            <label htmlFor="sel-email" className="text-xs font-medium text-fg-soft mb-1 block">{g.yourEmail}</label>
            <input id="sel-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} className={field} />
          </div>
          <div>
            <label htmlFor="sel-note" className="text-xs font-medium text-fg-soft mb-1 block">{g.yourNote}</label>
            <textarea id="sel-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className={`${field} resize-none`} />
          </div>

          {/* Honeypot — hidden from people, bots fill it. */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            className="hidden"
          />

          {error && (
            <p role="alert" className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="flex-1 border border-line text-fg-soft rounded-xl py-3 text-sm font-medium hover:bg-surface-2 transition-colors disabled:opacity-50"
            >
              {g.cancel}
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex-1 bg-accent text-canvas rounded-pill py-3 text-sm font-semibold hover:bg-surface-2 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <div className="w-4 h-4 border-2 border-fg-muted/40 border-t-white rounded-full animate-spin" />
                  {g.sendSending}
                </>
              ) : (
                g.sendCta
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
