"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { PlanDoc } from "@/lib/firestore/types";

export type CreatedUser = {
  user: { uid: string; email: string; displayName: string };
  generatedPassword?: string;
  assignedPlan?: { id: string; name: string; interval: string; expiresAt: number };
};

/**
 * Back-office modal for creating a user account (email/password).
 * Optionally assigns a payment plan right away. When the password is left
 * blank one is generated server-side and shown ONCE for the admin to share.
 */
export function CreateUserModal({
  plans,
  onClose,
  onCreated,
}: {
  plans: Pick<PlanDoc, "id" | "name" | "interval" | "priceCents" | "active">[];
  onClose: () => void;
  onCreated: (created: CreatedUser) => void;
}) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [planId, setPlanId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!user || busy) return;
    setError("");
    if (!email.trim() || !displayName.trim()) {
      setError("Email and name are required.");
      return;
    }
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim(),
          ...(password ? { password } : {}),
          ...(planId ? { planId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create the account.");
        return;
      }
      onCreated(data);
    } catch {
      setError("Could not create the account.");
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
        className="bg-[#111111] border border-white/[0.1] rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white mb-1" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          New user
        </h2>
        <p className="text-xs text-stone-500 mb-5">
          Creates an email &amp; password account. The user signs in from the login page with these credentials.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-stone-400 mb-1">Full name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Maria Papadopoulos"
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@studio.com"
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-white/25"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">
              Password <span className="text-stone-600">(leave blank to auto-generate)</span>
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-white/25 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">
              Assign plan <span className="text-stone-600">(optional)</span>
            </label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="w-full bg-[#111111] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/25 cursor-pointer"
            >
              <option value="">No plan — free account</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.interval} · ${(p.priceCents / 100).toFixed(2)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-xs text-red-400 mt-4">{error}</p>}

        <div className="flex gap-2 mt-6">
          <button
            onClick={handleCreate}
            disabled={busy}
            className="flex-1 bg-[#17509e] text-white text-sm font-semibold rounded-xl py-2.5 hover:bg-[#103a75] disabled:opacity-50 transition-colors"
          >
            {busy ? "Creating..." : "Create account"}
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

/** Success panel shown right after creating a user — displays the generated
 * password exactly once, so it can be copied and shared. */
export function CreatedUserPanel({ created, onClose }: { created: CreatedUser; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111111] border border-emerald-500/20 rounded-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-white mb-1" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          Account created
        </h2>
        <p className="text-xs text-stone-500 mb-5">
          Share these credentials with {created.user.displayName} — they sign in at the login page.
        </p>

        <div className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-stone-500">Email</span>
            <span className="text-white font-mono">{created.user.email}</span>
          </div>
          {created.generatedPassword && (
            <div className="flex justify-between gap-3">
              <span className="text-stone-500">Password</span>
              <span className="text-[#2dabe0] font-mono font-semibold">{created.generatedPassword}</span>
            </div>
          )}
          {created.assignedPlan && (
            <div className="flex justify-between gap-3">
              <span className="text-stone-500">Plan</span>
              <span className="text-emerald-400 font-semibold">
                {created.assignedPlan.name} ({created.assignedPlan.interval})
              </span>
            </div>
          )}
        </div>

        {created.generatedPassword && (
          <p className="text-[11px] text-amber-400/80 mt-4">
            This password is shown only once — copy it now.
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full bg-white text-stone-900 text-sm font-bold rounded-xl py-2.5 mt-5 hover:bg-stone-100 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
