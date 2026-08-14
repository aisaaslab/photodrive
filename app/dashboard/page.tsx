"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { NewGalleryForm } from "@/components/dashboard/NewGalleryForm";
import { GalleryList } from "@/components/dashboard/GalleryList";
import { GalleryDoc } from "@/lib/firestore/types";

type SortOption = "newest" | "oldest" | "name_asc" | "name_desc";

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [galleries, setGalleries] = useState<GalleryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [pendingGallery, setPendingGallery] = useState<{ name: string; driveUrl: string; password: string } | null>(null);

  async function loadGalleries() {
    if (!user) return;
    setLoadError(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/galleries", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGalleries(data.galleries ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (searchParams.get("gallery") === "pending") {
      const stored = localStorage.getItem("pending_gallery");
      if (stored) {
        try {
          setPendingGallery(JSON.parse(stored));
          setShowForm(true);
        } catch {}
        localStorage.removeItem("pending_gallery");
      }
      router.replace("/dashboard");
    }
  }, [searchParams, router]);

  useEffect(() => {
    loadGalleries();
    if (user) {
      user.getIdToken().then((token) =>
        fetch("/api/user/subscription", { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((data) => {
            if (data.expiresAt) {
              const days = Math.ceil((data.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
              setDaysLeft(days > 0 ? days : 0);
            }
          })
      );
    }
  }, [user]);

  function handleUpdate(updated: GalleryDoc) {
    setGalleries((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
  }

  async function handleDelete(id: string) {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch(`/api/galleries/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setGalleries((prev) => prev.filter((g) => g.id !== id));
  }

  const filteredAndSorted = useMemo(() => {
    let result = galleries.filter((g) =>
      g.name.toLowerCase().includes(search.toLowerCase())
    );
    switch (sort) {
      case "newest":
        result = result.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case "oldest":
        result = result.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case "name_asc":
        result = result.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        break;
      case "name_desc":
        result = result.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
        break;
    }
    return result;
  }, [galleries, search, sort]);

  const firstName = user?.displayName?.split(" ")[0];

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
            {firstName ? `${t.dashboard.welcome} ${firstName}` : t.dashboard.myGalleries}
          </h1>
          <p className="text-white/70 text-sm mt-1">
            {loading
              ? ""
              : galleries.length === 0
              ? t.dashboard.firstGallery
              : `${galleries.length} ${galleries.length === 1 ? t.dashboard.gallery : t.dashboard.galleries}`}
          </p>
          {daysLeft !== null && (
            <p className="text-xs text-white/40 mt-1">
              {t.dashboard.subscription} <span className={daysLeft <= 30 ? "text-[#33A39A]" : "text-white/60"}>{daysLeft} {t.dashboard.daysLeft}</span>
            </p>
          )}
        </div>

        <button
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 inline-flex items-center gap-2 bg-white text-stone-900 rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-stone-100 transition-all hover:scale-[1.02] active:scale-[0.98] self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t.dashboard.newGallery}
        </button>
      </div>

      {/* New gallery form */}
      {showForm && (
        <div className="animate-scale-in">
          <NewGalleryForm
            onCreated={() => {
              loadGalleries();
              setShowForm(false);
              setPendingGallery(null);
            }}
            onCancel={() => { setShowForm(false); setPendingGallery(null); }}
            initialData={pendingGallery ?? undefined}
          />
        </div>
      )}

      {/* Divider */}
      {!showForm && <div className="h-px bg-white/[0.06]" />}

      {/* Search + Sort */}
      {!loading && galleries.length > 0 && (
        <div className="flex gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.dashboard.searchPlaceholder}
              className="w-full bg-[#111111] border border-white/[0.1] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-stone-600 outline-none focus:border-white/25 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="bg-[#111111] border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-white/25 transition-all cursor-pointer"
          >
            <option value="newest">{t.dashboard.sortNewest}</option>
            <option value="oldest">{t.dashboard.sortOldest}</option>
            <option value="name_asc">{t.dashboard.sortNameAZ}</option>
            <option value="name_desc">{t.dashboard.sortNameZA}</option>
          </select>
        </div>
      )}

      {/* Empty search result */}
      {!loading && search && filteredAndSorted.length === 0 && galleries.length > 0 && (
        <div className="text-center py-12">
          <p className="text-stone-500 text-sm">{t.dashboard.noResults} &quot;{search}&quot;</p>
        </div>
      )}

      {/* Load error */}
      {loadError && (
        <div className="text-center py-16">
          <p className="text-stone-500 text-sm mb-3">{t.dashboard.loadError}</p>
          <button onClick={loadGalleries} className="text-xs text-white underline underline-offset-2">
            {t.dashboard.retry}
          </button>
        </div>
      )}

      {/* Gallery list */}
      {!loadError && loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border border-white/[0.06] rounded-2xl overflow-hidden animate-fade-up bg-white/[0.02]">
              <div className="h-36 bg-white/[0.04] animate-pulse" />
              <div className="p-4 space-y-2.5">
                <div className="h-4 bg-white/[0.06] rounded-lg w-3/4 animate-pulse" />
                <div className="h-3 bg-white/[0.04] rounded w-1/2 animate-pulse" />
                <div className="h-8 bg-white/[0.04] rounded-xl w-full mt-1 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : !loadError ? (
        <GalleryList galleries={filteredAndSorted} onDelete={handleDelete} onUpdate={handleUpdate} />
      ) : null}
    </div>
  );
}
