"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";

type Status = "idle" | "sending" | "sent" | "error";

export function ContactModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const c = t.contact;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStatus("idle");
    setError("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const inputCls =
    "w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-stone-600 outline-none focus:border-white/30 focus:bg-white/[0.06] transition-colors";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, website: "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || c.errorGeneric);
      setStatus("sent");
    } catch (err) {
      setError((err as Error).message || c.errorGeneric);
      setStatus("error");
    }
  }

  function handleClose() {
    setName("");
    setEmail("");
    setSubject("");
    setMessage("");
    setStatus("idle");
    setError("");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={c.formTitle}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative w-full max-w-md bg-[#101010] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleClose}
          aria-label={c.close}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-stone-500 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <svg width={16} height={16} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {status === "sent" ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <svg width={22} height={22} fill="none" viewBox="0 0 24 24" stroke="#34d399" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-2" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
              {c.sentTitle}
            </h2>
            <p className="text-sm text-stone-400 mb-6">{c.sentBody}</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => { setStatus("idle"); setName(""); setEmail(""); setSubject(""); setMessage(""); }}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-white/10 text-stone-300 hover:text-white hover:border-white/20 transition-colors"
              >
                {c.sendAnother}
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-white text-stone-900 hover:bg-stone-200 transition-colors"
              >
                {c.close}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-white mb-1" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
              {c.formTitle}
            </h2>
            <p className="text-sm text-stone-400 mb-6">{c.formSubtitle}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-name" className="block text-xs font-medium text-stone-400 mb-1.5">
                    {c.nameLabel}
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={c.namePlaceholder}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="block text-xs font-medium text-stone-400 mb-1.5">
                    {c.emailLabel}
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={c.emailPlaceholder}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="contact-subject" className="block text-xs font-medium text-stone-400 mb-1.5">
                  {c.subjectLabel}
                </label>
                <input
                  id="contact-subject"
                  type="text"
                  maxLength={150}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={c.subjectPlaceholder}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="contact-message" className="block text-xs font-medium text-stone-400 mb-1.5">
                  {c.messageLabel}
                </label>
                <textarea
                  id="contact-message"
                  required
                  minLength={10}
                  maxLength={5000}
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={c.messagePlaceholder}
                  className={`${inputCls} resize-none`}
                />
              </div>
              {/* Honeypot — hidden from humans, traps bots */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                aria-hidden="true"
              />
              {status === "error" && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                  {error || c.errorGeneric}
                </p>
              )}
              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full bg-white text-stone-900 font-semibold py-2.5 rounded-xl text-sm hover:bg-stone-200 transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {status === "sending" ? c.sending : c.send}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
