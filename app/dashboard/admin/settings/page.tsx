"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { SUPPORT_EMAIL } from "@/lib/branding";
import { TRACKING_FIELDS, TRACKING_PATTERNS, checkSupportEmail, checkTrackingId, type TrackingField } from "@/lib/shared/site-rules";

type Values = { supportEmail: string; gtmId: string; googleAdsId: string; metaPixelId: string };
type Loaded = Values & { updatedAt?: number; updatedByEmail?: string | null };

const EMPTY: Values = { supportEmail: "", gtmId: "", googleAdsId: "", metaPixelId: "" };

const HINTS: Record<TrackingField, string> = {
  metaPixelId: "Loads the Meta Pixel on every page and fires Purchase on the Thank You page. Numbers only.",
  gtmId: "Loads your GTM container. Don't also fire the Meta Pixel from inside GTM, or purchases are counted twice.",
  googleAdsId: "Loads the Google Ads global site tag.",
};
const ORDER: TrackingField[] = ["metaPixelId", "gtmId", "googleAdsId"];

function formatWhen(ts: number) {
  return new Date(ts).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
}

/** Admin Settings (S8-04): the support address and the tracking IDs. Checked as you type with the same rules the server enforces. */
export default function AdminSettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [saved, setSaved] = useState<Values>(EMPTY);
  const [draft, setDraft] = useState<Values>(EMPTY);
  const [meta, setMeta] = useState<{ updatedAt?: number; updatedByEmail?: string | null }>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState<"email" | "tracking" | null>(null);
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [serverError, setServerError] = useState<Partial<Record<keyof Values, string>>>({});

  const apply = useCallback((data: Loaded) => {
    const v: Values = { supportEmail: data.supportEmail ?? "", gtmId: data.gtmId ?? "", googleAdsId: data.googleAdsId ?? "", metaPixelId: data.metaPixelId ?? "" };
    setSaved(v);
    setDraft(v);
    setMeta({ updatedAt: data.updatedAt, updatedByEmail: data.updatedByEmail });
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setFailed(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/settings", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(String(res.status));
      apply(await res.json());
    } catch { setFailed(true); }
    setLoading(false);
  }, [user, apply]);

  useEffect(() => { void load(); }, [load]);

  const errors = useMemo(() => {
    const e: Partial<Record<keyof Values, string>> = {};
    const mail = checkSupportEmail(draft.supportEmail);
    if (!mail.ok) e.supportEmail = mail.error;
    for (const f of TRACKING_FIELDS) {
      const r = checkTrackingId(f, draft[f]);
      if (!r.ok) e[f] = r.error;
    }
    return e;
  }, [draft]);

  const shownError = (k: keyof Values) => (touched[k] ? errors[k] : undefined) || serverError[k] || undefined;
  const set = (k: keyof Values, v: string) => { setDraft((d) => ({ ...d, [k]: v })); setServerError((s) => ({ ...s, [k]: undefined })); };
  const touch = (k: keyof Values) => setTouched((t) => ({ ...t, [k]: true }));

  const emailDirty = draft.supportEmail.trim().toLowerCase() !== saved.supportEmail.trim().toLowerCase();
  const trackingDirty = TRACKING_FIELDS.some((f) => draft[f].trim() !== saved[f]);

  async function save(part: "email" | "tracking") {
    if (!user || saving) return;
    const keys: (keyof Values)[] = part === "email" ? ["supportEmail"] : [...TRACKING_FIELDS];
    setTouched((t) => ({ ...t, ...Object.fromEntries(keys.map((k) => [k, true])) }));
    if (keys.some((k) => errors[k])) return;
    setSaving(part);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(Object.fromEntries(keys.map((k) => [k, draft[k]]))),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(data.fields ?? {});
        toast(data.error || "Could not save.", "error");
      } else {
        // Keep what the other form is still holding unsaved.
        const keep = part === "email" ? { gtmId: draft.gtmId, googleAdsId: draft.googleAdsId, metaPixelId: draft.metaPixelId } : { supportEmail: draft.supportEmail };
        apply(data);
        setDraft((d) => ({ ...d, ...keep }));
        setTouched({});
        toast(data.changed === false ? "Nothing had changed." : part === "email" ? "Support email saved." : "Tracking IDs saved.", "success");
      }
    } catch {
      toast("Could not save. Check your connection and try again.", "error");
    }
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-5 h-5 border-2 border-fg-muted/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }
  if (failed) {
    return (
      <div className="py-24 text-center">
        <p className="text-fg-muted mb-4">The settings could not be loaded.</p>
        <Button variant="outline" size="sm" onClick={load}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>Settings</h1>
        <p className="text-sm text-fg-muted mt-1">
          Contact email and tracking tags. Messages from the contact form are in <Link href="/dashboard/admin/support" className="text-accent underline underline-offset-2">Support</Link>.
        </p>
        {meta.updatedAt ? (
          <p className="text-xs text-fg-muted mt-1 break-words" data-testid="settings-last-change">
            Last changed {formatWhen(meta.updatedAt)}{meta.updatedByEmail ? <> by {meta.updatedByEmail}</> : null}.
          </p>
        ) : null}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void save("email"); }} noValidate className="border border-line rounded-card p-5 mb-6">
        <h2 className="text-sm font-semibold text-fg mb-1">Support email</h2>
        <p className="text-xs text-fg-muted mb-4 leading-relaxed">
          Shown on the contact page and used as the recipient for the contact form. Updates take effect immediately, no redeploy needed.
        </p>
        <Input
          label="Support email address"
          type="email"
          autoComplete="off"
          maxLength={254}
          value={draft.supportEmail}
          onChange={(e) => set("supportEmail", e.target.value)}
          onBlur={() => touch("supportEmail")}
          placeholder={SUPPORT_EMAIL}
          error={shownError("supportEmail")}
        />
        <div className="mt-4">
          <Button type="submit" size="sm" loading={saving === "email"} disabled={!emailDirty || saving !== null}>Save</Button>
        </div>
      </form>

      <form onSubmit={(e) => { e.preventDefault(); void save("tracking"); }} noValidate className="border border-line rounded-card p-5">
        <h2 className="text-sm font-semibold text-fg mb-1">Tracking &amp; analytics</h2>
        <p className="text-xs text-fg-muted mb-4 leading-relaxed">
          Enter only the ID, not a script. Leave a field empty to switch that tag off. Changes apply to new page loads within seconds.
        </p>
        <div className="space-y-4">
          {ORDER.map((f) => (
            <Input
              key={f}
              label={TRACKING_PATTERNS[f].label}
              inputMode={f === "metaPixelId" ? "numeric" : "text"}
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              className="font-mono"
              value={draft[f]}
              onChange={(e) => set(f, e.target.value)}
              onBlur={() => touch(f)}
              placeholder={TRACKING_PATTERNS[f].example}
              hint={HINTS[f]}
              error={shownError(f)}
            />
          ))}
        </div>
        <div className="mt-4">
          <Button type="submit" size="sm" loading={saving === "tracking"} disabled={!trackingDirty || saving !== null}>Save</Button>
        </div>
      </form>
    </div>
  );
}
