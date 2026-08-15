"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n";

export function DemoForm() {
  const { t } = useLanguage();
  const d = t.demo;
  const router = useRouter();
  const [driveUrl, setDriveUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/demo/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveUrl }),
      });
      if (res.status === 429) { setError(d.rateLimitError); return; }
      if (!res.ok) {
        const data = await res.json();
        setError(data.error === "Invalid Google Drive folder URL" ? d.invalidUrl : d.genericError);
        return;
      }
      const { id } = await res.json();
      router.push(`/demo/${id}`);
    } catch {
      setError(d.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="demo" className="py-16 sm:py-24 px-6 border-t border-white/5">
      <div className="max-w-xl mx-auto text-center">
        <p className="text-sm font-semibold tracking-[0.2em] uppercase text-[#2dabe0] mb-4">{d.label}</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
          {d.title}
        </h2>
        <p className="text-white text-base mb-2">{d.subtitle}</p>
        <p className="text-white text-base mb-8">{d.hint}</p>

        <form onSubmit={handleSubmit}>
          <div className="flex gap-2 bg-white/[0.04] border border-white/10 rounded-2xl p-1.5">
            <input
              type="text"
              required
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="flex-1 bg-transparent px-4 py-3 text-white placeholder-white/25 text-sm focus:outline-none min-w-0"
            />
            <button
              type="submit"
              disabled={loading}
              className="shrink-0 bg-white text-stone-900 font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-stone-100 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? d.loading : d.cta}
            </button>
          </div>
          {error && (
            <p className="text-[#2dabe0] text-sm mt-3">{error}</p>
          )}
        </form>
      </div>
    </section>
  );
}
