"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";

interface Props {
  onCreated: () => void;
  onCancel?: () => void;
  initialData?: { name: string; driveUrl: string; password: string; website?: string; instagram?: string; facebook?: string; description?: string; eventDate?: string; location?: string };
}

function isValidDriveUrl(url: string): boolean {
  return /drive\.google\.com\/(drive\/folders\/|open\?id=|folderview\?id=)/.test(url);
}

const SOCIALS = [
  {
    key: "website",
    label: "Website",
    placeholder: "https://yoursite.com",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M3.5 12h17M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" />
      </svg>
    ),
  },
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "https://instagram.com/username",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="3.8" />
        <circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    key: "facebook",
    label: "Facebook",
    placeholder: "https://facebook.com/yourpage",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0022 12z" />
      </svg>
    ),
  },
] as const;

export function NewGalleryForm({ onCreated, onCancel, initialData }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const f = t.newGalleryForm;
  const [name, setName] = useState(initialData?.name ?? "");
  const [driveUrl, setDriveUrl] = useState(initialData?.driveUrl ?? "");
  const [password, setPassword] = useState(initialData?.password ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [social, setSocial] = useState({
    website: initialData?.website ?? "",
    instagram: initialData?.instagram ?? "",
    facebook: initialData?.facebook ?? "",
  });
  const [socialOn, setSocialOn] = useState({
    website: !!initialData?.website,
    instagram: !!initialData?.instagram,
    facebook: !!initialData?.facebook,
  });
  // Optional gallery metadata: subtitle, event date, location.
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [eventDate, setEventDate] = useState(initialData?.eventDate ?? "");
  const [location, setLocation] = useState(initialData?.location ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const driveValid = driveUrl.length > 0 && isValidDriveUrl(driveUrl);
  const driveInvalid = driveUrl.length > 0 && !isValidDriveUrl(driveUrl);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError("");
    setLoading(true);

    try {
      const token = await user.getIdToken();

      const subRes = await fetch("/api/user/subscription", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const subData = await subRes.json();
      if (!subData.isActive) {
        setShowPayment(true);
        return;
      }

      const res = await fetch("/api/galleries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          driveUrl,
          password: password || undefined,
          website: socialOn.website ? social.website.trim() || undefined : undefined,
          instagram: socialOn.instagram ? social.instagram.trim() || undefined : undefined,
          facebook: socialOn.facebook ? social.facebook.trim() || undefined : undefined,
          description: description.trim() || undefined,
          eventDate: eventDate || undefined,
          location: location.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? f.error);
        return;
      }

      setName("");
      setDriveUrl("");
      setPassword("");
      setSocial({ website: "", instagram: "", facebook: "" });
      setSocialOn({ website: false, instagram: false, facebook: false });
      setDescription("");
      setEventDate("");
      setLocation("");
      onCreated();
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout() {
    if (!user) return;
    setCheckoutLoading(true);
    localStorage.setItem("pending_gallery", JSON.stringify({
      name, driveUrl, password,
      website: socialOn.website ? social.website : "",
      instagram: socialOn.instagram ? social.instagram : "",
      facebook: socialOn.facebook ? social.facebook : "",
      description,
      eventDate,
      location,
    }));
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(f.error);
    } catch {
      setError(f.error);
    } finally {
      setCheckoutLoading(false);
    }
  }

  const features = [f.f1, f.f2, f.f3, f.f4, f.f5, f.f6];

  if (showPayment) {
    return (
      <div className="bg-[#111111] border border-white/[0.1] rounded-2xl overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="font-semibold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{f.subscriptionTitle}</h2>
            <p className="text-xs text-white/60 mt-0.5">{f.subscriptionSubtitle}</p>
          </div>
          <button
            onClick={() => setShowPayment(false)}
            className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-3xl font-bold text-white">â‚¬89</span>
                <span className="text-stone-500 text-sm">{f.perYear}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-stone-500 line-through text-sm">â‚¬199</span>
                <span className="bg-[#17509e]/20 text-[#2dabe0] text-xs font-bold px-2 py-0.5 rounded-full border border-[#17509e]/20">-55%</span>
              </div>
            </div>
            <span className="bg-[#17509e]/20 text-[#2dabe0] text-xs font-semibold px-2.5 py-1 rounded-full border border-[#17509e]/20">
              {f.offer}
            </span>
          </div>

          <ul className="space-y-2 mb-6">
            {features.map((feat) => (
              <li key={feat} className="flex items-center gap-2 text-sm text-stone-300">
                <svg className="w-3.5 h-3.5 text-[#2dabe0] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {feat}
              </li>
            ))}
          </ul>

          <button
            onClick={handleCheckout}
            disabled={checkoutLoading}
            className="w-full bg-white text-stone-900 font-bold py-3 rounded-xl text-sm hover:bg-stone-100 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {checkoutLoading ? (
              <div className="w-4 h-4 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" />
            ) : (
              f.buy
            )}
          </button>

          {error && <p className="text-xs text-red-400 text-center mt-3">{error}</p>}

          <button
            onClick={() => setShowPayment(false)}
            className="w-full mt-2 text-stone-500 hover:text-white text-xs py-2 transition-colors"
          >
            {f.backToForm}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#111111] border border-white/[0.1] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div>
          <h2 className="font-semibold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>{f.title}</h2>
          <p className="text-xs text-white/60 mt-0.5">{f.subtitle}</p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {/* Gallery name */}
        <div>
          <label className="block text-xs font-medium text-white mb-1.5">
            {f.nameLabel}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={f.namePlaceholder}
            required
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-600 outline-none focus:border-white/25 transition-all"
          />
        </div>

        {/* Optional gallery metadata */}
        <div>
          <label className="block text-xs font-medium text-white mb-1.5">
            {f.descriptionLabel}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={f.descriptionPlaceholder}
            rows={2}
            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-600 outline-none focus:border-white/25 transition-all resize-none"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-white mb-1.5">
              {f.eventDateLabel}
            </label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-600 outline-none focus:border-white/25 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white mb-1.5">
              {f.locationLabel}
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={f.locationPlaceholder}
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-600 outline-none focus:border-white/25 transition-all"
            />
          </div>
        </div>

        {/* Drive URL */}
        <div>
          <label className="block text-xs font-medium text-white mb-1.5">
            {f.driveLabel}
          </label>
          <div className="relative">
            <input
              type="url"
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder={f.drivePlaceholder}
              required
              className={`w-full bg-[#1a1a1a] border rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-stone-600 outline-none transition-all ${
                driveValid
                  ? "border-emerald-500/50 focus:border-emerald-500"
                  : driveInvalid
                  ? "border-red-500/50 focus:border-red-500"
                  : "border-white/10 focus:border-white/25"
              }`}
            />
            {driveValid && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
            )}
            {driveInvalid && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <svg className="w-3 h-3 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <p className="text-xs text-white/60">{f.driveHint}</p>
          </div>
        </div>

        {/* Password toggle */}
        <div className="bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-center gap-2.5 text-sm text-white">
              <svg className="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              {f.passwordLabel}
              <span className="text-xs text-white/40">{f.passwordOptional}</span>
            </div>
            <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${showPassword ? "bg-white/80" : "bg-white/10"}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${showPassword ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
          </button>

          {showPassword && (
            <div className="px-4 pb-4 pt-1 border-t border-white/[0.06] animate-scale-in">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={f.passwordPlaceholder}
                autoFocus
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-600 outline-none focus:border-white/25 transition-all"
              />
            </div>
          )}
        </div>

        {/* Social links (optional) */}
        <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-4 space-y-2.5">
          <div className="text-xs font-medium text-white/80">
            {f.linksLabel} <span className="text-white/40">{f.passwordOptional}</span>
          </div>
          {SOCIALS.map((soc) => (
            <div key={soc.key}>
              <button
                type="button"
                onClick={() => setSocialOn((s) => ({ ...s, [soc.key]: !s[soc.key] } as typeof s))}
                className="flex items-center gap-2.5 text-sm text-white w-full"
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${socialOn[soc.key] ? "bg-[#17509e] border-[#17509e]" : "border-white/25"}`}>
                  {socialOn[soc.key] && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </span>
                <span className="text-white/70 shrink-0">{soc.icon}</span>
                {soc.label}
              </button>
              {socialOn[soc.key] && (
                <input
                  type="url"
                  value={social[soc.key]}
                  onChange={(e) => setSocial((s) => ({ ...s, [soc.key]: e.target.value } as typeof s))}
                  placeholder={soc.placeholder}
                  className="mt-2 w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-600 outline-none focus:border-white/25 transition-all"
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
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
              className="flex-1 border border-white/10 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-white/[0.04] transition-colors"
            >
              {f.cancel}
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-white text-stone-900 rounded-xl py-2.5 text-sm font-medium hover:bg-stone-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" />
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
