"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

type InboxMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: number;
  read?: boolean;
  emailed?: boolean;
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const [supportEmail, setSupportEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const token = await user!.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const headers = await authHeaders();
      const [settingsRes, messagesRes] = await Promise.all([
        fetch("/api/admin/settings", { headers }),
        fetch("/api/admin/messages?limit=50", { headers }),
      ]);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setSupportEmail(data.supportEmail ?? "");
        setSavedEmail(data.supportEmail ?? "");
      }
      if (messagesRes.ok) {
        setMessages((await messagesRes.json()).messages ?? []);
      }
    } catch {
      // ignore — retry via UI
    }
    setLoading(false);
  }, [user, authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!user || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ supportEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setSavedEmail(data.supportEmail);
      setSupportEmail(data.supportEmail);
      setNotice({ tone: "ok", text: `Support email updated to ${data.supportEmail}. The contact page uses it immediately — no redeploy needed.` });
    } catch (err) {
      setNotice({ tone: "err", text: (err as Error).message });
    }
    setSaving(false);
  }

  async function markRead(id: string, read: boolean) {
    if (!user) return;
    setBusyId(id);
    const headers = await authHeaders();
    const res = await fetch(`/api/admin/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ read }),
    });
    if (res.ok) {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, read } : m)));
    }
    setBusyId(null);
  }

  async function deleteMessage(id: string) {
    if (!user || !confirm("Delete this message?")) return;
    setBusyId(id);
    const headers = await authHeaders();
    const res = await fetch(`/api/admin/messages/${id}`, { method: "DELETE", headers });
    if (res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }
    setBusyId(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const unread = messages.filter((m) => !m.read).length;
  const dirty = supportEmail.trim().toLowerCase() !== savedEmail.trim().toLowerCase();

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          Settings
        </h1>
        <p className="text-sm text-stone-400 mt-1">Contact email and inbox.</p>
      </div>

      {/* Support email */}
      <form onSubmit={saveEmail} className="border border-white/[0.06] rounded-2xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-white mb-1">Support email</h2>
        <p className="text-xs text-stone-500 mb-4 leading-relaxed">
          Shown on the contact page and used as the recipient for the contact form.
          Updates take effect immediately — no redeploy or env change needed.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            required
            maxLength={254}
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            placeholder="support@photodrive.co"
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-stone-600 outline-none focus:border-white/30 transition-colors"
          />
          <button
            type="submit"
            disabled={saving || !dirty}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-white text-stone-900 hover:bg-stone-200 transition-colors disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {notice && (
          <p className={`text-xs mt-3 leading-relaxed ${notice.tone === "ok" ? "text-emerald-400" : "text-red-400"}`}>
            {notice.text}
          </p>
        )}
      </form>

      {/* Inbox */}
      <div className="border border-white/[0.06] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Inbox</h2>
          <span className="text-xs text-stone-500">
            {messages.length === 0
              ? "No messages yet"
              : `${unread} unread · ${messages.length} total`}
          </span>
        </div>
        {messages.length === 0 ? (
          <p className="text-sm text-stone-500 py-6 text-center">
            Contact-form messages will appear here, and will also be forwarded to your support email when delivery is configured.
          </p>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => {
              const expanded = expandedId === m.id;
              return (
                <div
                  key={m.id}
                  className={`border rounded-xl overflow-hidden ${m.read ? "border-white/[0.06]" : "border-[#2dabe0]/30 bg-[#17509e]/[0.04]"}`}
                >
                  <button
                    onClick={() => {
                      setExpandedId(expanded ? null : m.id);
                      if (!expanded && !m.read) markRead(m.id, true);
                    }}
                    className="w-full text-left px-4 py-3 flex items-center gap-3"
                  >
                    {!m.read && <span className="w-1.5 h-1.5 rounded-full bg-[#2dabe0] shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-white truncate">{m.subject}</span>
                        {m.emailed === false && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                            inbox only
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-stone-500 truncate mt-0.5">
                        {m.name} · {m.email} · {formatDate(m.createdAt)}
                      </div>
                    </div>
                    <span className="text-stone-500 text-sm shrink-0">{expanded ? "−" : "+"}</span>
                  </button>
                  {expanded && (
                    <div className="px-4 pb-4">
                      <p className="text-sm text-stone-300 leading-relaxed whitespace-pre-wrap border-t border-white/[0.06] pt-3">
                        {m.message}
                      </p>
                      <div className="flex items-center gap-2 mt-3">
                        <a
                          href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}
                          className="text-xs px-3 py-1.5 rounded-lg bg-white text-stone-900 font-semibold hover:bg-stone-200 transition-colors"
                        >
                          Reply
                        </a>
                        <button
                          onClick={() => markRead(m.id, !m.read)}
                          disabled={busyId === m.id}
                          className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-stone-300 hover:text-white hover:border-white/20 transition-colors"
                        >
                          {m.read ? "Mark unread" : "Mark read"}
                        </button>
                        <button
                          onClick={() => deleteMessage(m.id)}
                          disabled={busyId === m.id}
                          className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-stone-500 hover:text-red-400 hover:border-red-500/30 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
