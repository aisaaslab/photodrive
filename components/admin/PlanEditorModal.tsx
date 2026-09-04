"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export type PlanDraft = {
  id?: string;
  name: string;
  description: string;
  interval: "monthly" | "yearly";
  price: string;
  features: string[];
  isPublic: boolean;
  active: boolean;
  highlight: boolean;
  sortOrder: string;
};

export const emptyDraft: PlanDraft = {
  name: "",
  description: "",
  interval: "yearly",
  price: "",
  features: [],
  isPublic: true,
  active: true,
  highlight: false,
  sortOrder: "0",
};

/**
 * Back-office modal for creating / editing a payment plan. Public plans show
 * up on the landing-page pricing section; private plans are only reachable
 * via their direct subscribe link or by admin assignment.
 */
export function PlanEditorModal({
  draft,
  onClose,
  onSaved,
}: {
  draft: PlanDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const isEdit = Boolean(draft.id);
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">(draft.interval);
  const [price, setPrice] = useState(draft.price);
  const [featuresText, setFeaturesText] = useState(draft.features.join("\n"));
  const [isPublic, setIsPublic] = useState(draft.isPublic);
  const [active, setActive] = useState(draft.active);
  const [highlight, setHighlight] = useState(draft.highlight);
  const [sortOrder, setSortOrder] = useState(draft.sortOrder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!user || busy) return;
    setError("");
    if (!name.trim()) {
      setError("Plan name is required.");
      return;
    }
    if (!price || Number(price) <= 0) {
      setError("Enter a price greater than zero.");
      return;
    }
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const body = {
        name: name.trim(),
        description: description.trim(),
        interval: billingInterval,
        price: Number(price),
        features: featuresText
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean),
        isPublic,
        active,
        highlight,
        sortOrder: Number(sortOrder) || 0,
      };
      const res = await fetch(isEdit ? `/api/admin/plans/${draft.id}` : "/api/admin/plans", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save the plan.");
        return;
      }
      onSaved();
    } catch {
      setError("Could not save the plan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111111] border border-white/[0.1] rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white mb-1" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {isEdit ? "Edit plan" : "New plan"}
        </h2>
        <p className="text-xs text-stone-500 mb-5">
          {isPublic ? "Public plans appear on the pricing section of the landing page." : "Private plans are only reachable via their direct link or by assigning them to a user."}
        </p>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-400 mb-1">Plan name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Pro"
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Billing period</label>
              <div className="flex gap-2">
                {(["monthly", "yearly"] as const).map((iv) => (
                  <button
                    key={iv}
                    type="button"
                    onClick={() => setBillingInterval(iv)}
                    className={`flex-1 text-sm font-semibold rounded-xl py-2.5 border transition-colors ${
                      billingInterval === iv
                        ? "bg-[#17509e] border-[#17509e] text-white"
                        : "bg-white/[0.04] border-white/10 text-stone-400 hover:text-white"
                    }`}
                  >
                    {iv === "monthly" ? "Monthly" : "Yearly"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-400 mb-1">Price (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="99"
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-white/25"
              />
              <p className="text-[11px] text-stone-600 mt-1">
                One-time payment for {billingInterval === "monthly" ? "30 days" : "365 days"} of access · no auto-renewal
              </p>
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Sort order</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="0"
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-white/25"
              />
              <p className="text-[11px] text-stone-600 mt-1">Lower numbers appear first on the pricing grid.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-stone-400 mb-1">
              Short description <span className="text-stone-600">(optional)</span>
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. For studios delivering every week"
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-white/25"
            />
          </div>

          <div>
            <label className="block text-xs text-stone-400 mb-1">
              Features <span className="text-stone-600">(one per line, shown on the pricing card)</span>
            </label>
            <textarea
              value={featuresText}
              onChange={(e) => setFeaturesText(e.target.value)}
              rows={5}
              placeholder={"Unlimited galleries\nUnlimited photos & videos\nPassword protection"}
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-white/25 resize-none"
            />
          </div>

          <div className="space-y-2.5">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm text-white">Public — show on landing page pricing</span>
              <Toggle checked={isPublic} onChange={setIsPublic} />
            </label>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm text-white">Highlight as “popular” on the pricing grid</span>
              <Toggle checked={highlight} onChange={setHighlight} />
            </label>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm text-white">Active — can be purchased &amp; assigned</span>
              <Toggle checked={active} onChange={setActive} />
            </label>
          </div>
        </div>

        {error && <p className="text-xs text-red-400 mt-4">{error}</p>}

        <div className="flex gap-2 mt-6">
          <button
            onClick={handleSave}
            disabled={busy}
            className="flex-1 bg-[#17509e] text-white text-sm font-semibold rounded-xl py-2.5 hover:bg-[#103a75] disabled:opacity-50 transition-colors"
          >
            {busy ? "Saving..." : isEdit ? "Save changes" : "Create plan"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-white/10 text-stone-400 text-sm rounded-xl hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${checked ? "bg-[#17509e]" : "bg-white/10"}`}
      aria-checked={checked}
      role="switch"
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : ""}`}
      />
    </button>
  );
}
