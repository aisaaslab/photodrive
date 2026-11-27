"use client";

import { useState, useEffect, useMemo } from "react";
import { planPhase } from "@/lib/gallery/availability";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage, LOCALES } from "@/lib/i18n";
import { NewGalleryForm } from "@/components/dashboard/NewGalleryForm";
import { GalleryList } from "@/components/dashboard/GalleryList";
import { Modal } from "@/components/ui/Modal";
import { GalleryCreatedModal } from "@/components/dashboard/GalleryCreatedModal";
import { isPrivate } from "@/lib/gallery/visibility";
import { hasNewSelections } from "@/lib/gallery/gallery-settings";
import { cn, focusRing } from "@/lib/ui/cn";
import { GalleryDoc } from "@/lib/firestore/types";
import { useToast } from "@/components/ui/Toast";
import { PaymentNotice } from "@/components/dashboard/PaymentNotice";

type SortOption = "newest" | "oldest" | "name_asc" | "name_desc";

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const { t, lang } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [galleries, setGalleries] = useState<GalleryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [createdGallery, setCreatedGallery] = useState<GalleryDoc | null>(null);
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "public" | "private" | "new">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const toast = useToast();

  // Remember the chosen sort order between visits.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("dashboard_sort") as SortOption | null;
      if (saved && ["newest", "oldest", "name_asc", "name_desc"].includes(saved)) setSort(saved);
    } catch {}
  }, []);
  function changeSort(next: SortOption) {
    setSort(next);
    try { localStorage.setItem("dashboard_sort", next); } catch {}
  }
  // Subscription summary for the header + renewal banner.
  const [sub, setSub] = useState<{ daysLeft: number; expiresAt: number; planName: string | null; interval: string | null; lapse: { enforced: boolean; graceDays: number } } | null>(null);
  const daysLeft = sub?.daysLeft ?? null;
  const isLifetime = !!sub && sub.expiresAt > 4102444800000;
  // A just-activated 30-day (monthly) plan is always "30 days left", so only
  // nudge it in its last week; longer plans get the nudge in the last 30 days.
  const nudgeWithinDays = sub?.interval === "monthly" ? 7 : 30;
  const showRenewBanner = !!sub && !isLifetime && sub.daysLeft <= nudgeWithinDays;
  const planLabel = sub?.planName
    || (sub?.interval === "monthly" ? t.dashboard.planMonthly : sub?.interval === "yearly" ? t.dashboard.planYearly : null);
  const expiresLabel = sub
    ? new Date(sub.expiresAt).toLocaleDateString(LOCALES[lang], { day: "numeric", month: "short", year: "numeric" })
    : "";
  // After the plan ends (D3): 14 days of grace with the galleries still online, then they are offline for visitors until renewal.
  // Only worded this way while the server actually does it (`lapse.enforced`), so the notice never promises what is not happening.
  const lapsePhase = sub?.lapse.enforced ? planPhase({ expiresAt: sub.expiresAt }, Date.now()) : null;
  const lapseNotice =
    lapsePhase?.phase === "grace"
      ? { title: t.dashboard.lapseGraceTitle, body: t.dashboard.lapseGraceBody.replace("{date}", new Date(lapsePhase.graceEndsAt).toLocaleDateString(LOCALES[lang], { day: "numeric", month: "short", year: "numeric" })) }
      : lapsePhase?.phase === "lapsed"
      ? { title: t.dashboard.lapseOfflineTitle, body: t.dashboard.lapseOfflineBody.replace("{days}", String(sub?.lapse.graceDays ?? 14)) }
      : null;
  const [pendingGallery, setPendingGallery] = useState<{ name: string; driveUrl: string; password: string } | null>(null);
  const [restoredFromPayment, setRestoredFromPayment] = useState(false);

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
          setRestoredFromPayment(true);
        } catch {}
        // Deliberately NOT removed here: keep the saved form until the gallery
        // is actually created, so a refresh (or a slow payment activation)
        // no longer throws the user's work away. NewGalleryForm's onCreated /
        // the cancel button clear it.
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
              setSub({
                daysLeft: days > 0 ? days : 0,
                expiresAt: data.expiresAt,
                planName: typeof data.planName === "string" ? data.planName : null,
                interval: typeof data.planInterval === "string" ? data.planInterval : null,
                lapse: { enforced: data.lapse?.enforced === true, graceDays: typeof data.lapse?.graceDays === "number" ? data.lapse.graceDays : 14 },
              });
            }
          })
      );
    }
  }, [user]);

  function handleUpdate(updated: GalleryDoc) {
    setGalleries((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
  }

  async function handleDelete(id: string): Promise<boolean> {
    if (!user) return false;
    const token = await user.getIdToken();
    const res = await fetch(`/api/galleries/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      // Don't drop the card from the list if the server refused.
      toast(t.dashboard.loadError, "error");
      return false;
    }
    setGalleries((prev) => prev.filter((g) => g.id !== id));
    return true;
  }

  // "New favourites" uses the same per-browser "last seen" marker as the card badge.
  const seenAt = (id: string) => { try { return Number(localStorage.getItem(`pd_sel_seen_${id}`)) || 0; } catch { return 0; } };
  const matchesFilter = (g: GalleryDoc) =>
    visibilityFilter === "all" ? true :
    visibilityFilter === "private" ? isPrivate(g) :
    visibilityFilter === "public" ? !isPrivate(g) :
    hasNewSelections(g, seenAt(g.id));
  const newCount = galleries.filter((g) => hasNewSelections(g, seenAt(g.id))).length;
  const privateCount = galleries.filter(isPrivate).length;

  const filteredAndSorted = useMemo(() => {
    let result = galleries.filter((g) =>
      g.name.toLowerCase().includes(search.toLowerCase()) && matchesFilter(g)
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
  }, [galleries, search, sort, visibilityFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- matchesFilter reads only these

  // Firestore profile is the source of truth — the user can edit their
  // display name in Account settings.
  const firstName = (profile?.name || user?.displayName || "")?.split(" ")[0];

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg" style={{ fontFamily: "var(--font-brand), sans-serif" }}>
            {firstName ? `${t.dashboard.welcome} ${firstName}` : t.dashboard.myGalleries}
          </h1>
          <p className="text-fg-soft text-sm mt-1">
            {loading
              ? ""
              : galleries.length === 0
              ? t.dashboard.firstGallery
              : `${galleries.length} ${galleries.length === 1 ? t.dashboard.gallery : t.dashboard.galleries}`}
          </p>
          {sub && (
            <Link
              href="/dashboard/account"
              className="mt-2.5 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-fg-muted/40 hover:text-fg-soft"
            >
              <span aria-hidden className={`size-1.5 rounded-full ${daysLeft === 0 ? "bg-danger" : showRenewBanner ? "bg-amber-400" : "bg-success-bright"}`} />
              <span>{t.dashboard.subscription}</span>
              <span className={showRenewBanner ? "font-semibold text-accent" : "font-semibold text-fg-soft"}>
                {planLabel ? `${planLabel} · ` : ""}
                {isLifetime ? t.dashboard.lifetime : `${t.dashboard.activeUntil} ${expiresLabel} (${sub.daysLeft} ${t.dashboard.daysLeft})`}
              </span>
            </Link>
          )}
        </div>

        <button
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 inline-flex items-center gap-2 bg-accent text-canvas rounded-pill px-5 py-2.5 text-sm font-semibold hover:brightness-110 transition-all hover:scale-[1.02] active:scale-[0.98] self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t.dashboard.newGallery}
        </button>
      </div>

      {/* A refund or dispute that reduced or paused access (S2-15) */}
      <PaymentNotice />

      {/* Subscription status — a visible nudge instead of tiny grey text, so an
          expiring or expired plan is never a surprise. */}
      {showRenewBanner && daysLeft !== null && (
        <div
          role="status"
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
            daysLeft === 0
              ? "bg-red-500/10 border-red-500/25"
              : "bg-accent/10 border-accent/25"
          }`}
        >
          <div className="text-sm">
            <p className={`font-semibold ${daysLeft === 0 ? "text-red-300" : "text-fg"}`}>
              {lapseNotice ? lapseNotice.title : daysLeft === 0 ? t.dashboard.subExpired : t.dashboard.subExpiringSoon}
              {daysLeft > 0 && (
                <span className="font-normal text-fg-muted"> · {daysLeft} {t.dashboard.daysLeft}</span>
              )}
            </p>
            <p className="text-fg-muted text-xs mt-0.5">{lapseNotice ? lapseNotice.body : t.dashboard.subRenewHint}</p>
          </div>
          <Link
            href="/subscribe"
            className="shrink-0 self-start sm:self-auto bg-accent text-canvas rounded-pill px-4 py-2 text-xs font-semibold hover:brightness-110 transition-colors"
          >
            {t.dashboard.renew}
          </Link>
        </div>
      )}

      {/* New gallery: a dialog, so the form never pushes the gallery list down the page (S5-12) */}
      {showForm && (
        <Modal
          ariaLabel={t.newGalleryForm.title}
          dismissOnBackdrop={false}
          className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-card shadow-window animate-scale-in"
          onClose={() => {
            setShowForm(false);
            setPendingGallery(null);
            setRestoredFromPayment(false);
            localStorage.removeItem("pending_gallery");
          }}
        >
          <NewGalleryForm
            onCreated={(created) => {
              loadGalleries();
              if (created?.slug) setCreatedGallery(created);
              setShowForm(false);
              setPendingGallery(null);
              setRestoredFromPayment(false);
              localStorage.removeItem("pending_gallery");
            }}
            onCancel={() => {
              setShowForm(false);
              setPendingGallery(null);
              setRestoredFromPayment(false);
              localStorage.removeItem("pending_gallery");
            }}
            initialData={pendingGallery ?? undefined}
            autoSubmit={restoredFromPayment}
          />
        </Modal>
      )}

      {createdGallery && <GalleryCreatedModal gallery={createdGallery} onClose={() => setCreatedGallery(null)} />}

      {/* Divider */}
      <div className="h-px bg-surface-2" />

      {/* Search + Sort */}
      {!loading && galleries.length > 0 && (
        <div className="flex gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.dashboard.searchPlaceholder}
              className="w-full bg-surface border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm text-fg placeholder:text-fg-muted outline-none focus:border-fg-muted/30 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg transition-colors"
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
            onChange={(e) => changeSort(e.target.value as SortOption)}
            aria-label={t.dashboard.sortNewest}
            className="bg-surface border border-line rounded-xl px-3 py-2.5 text-sm text-fg outline-none focus:border-fg-muted/30 transition-all cursor-pointer"
          >
            <option value="newest">{t.dashboard.sortNewest}</option>
            <option value="oldest">{t.dashboard.sortOldest}</option>
            <option value="name_asc">{t.dashboard.sortNameAZ}</option>
            <option value="name_desc">{t.dashboard.sortNameZA}</option>
          </select>
        </div>
      )}

      {/* Empty search result */}
      {/* Filter chips: only worth showing when there is something to tell apart */}
      {!loading && galleries.length > 1 && (privateCount > 0 || newCount > 0) && (
        <div role="group" aria-label={t.dashboard.myGalleries} className="flex flex-wrap gap-2">
          {([
            ["all", t.gallery.filterAll, galleries.length],
            ["public", t.galleryCard.publicBadge, galleries.length - privateCount],
            ["private", t.galleryCard.visibilityPrivate, privateCount],
            ...(newCount > 0 ? [["new", t.dashboard.filterNew, newCount] as const] : []),
          ] as const).map(([id, label, count]) => (
            <button
              key={id} type="button" aria-pressed={visibilityFilter === id} onClick={() => setVisibilityFilter(id)}
              className={cn("inline-flex h-9 items-center gap-2 rounded-pill border px-4 text-xs font-semibold transition-colors", visibilityFilter === id ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-fg-soft hover:border-fg-muted/40 hover:text-fg", focusRing)}
            >
              {label}<span className="text-fg-muted">{count}</span>
            </button>
          ))}
        </div>
      )}

      {!loading && search && filteredAndSorted.length === 0 && galleries.length > 0 && (
        <div className="text-center py-12">
          <p className="text-fg-muted text-sm">{t.dashboard.noResults} &quot;{search}&quot;</p>
        </div>
      )}

      {/* Load error */}
      {loadError && (
        <div className="text-center py-16">
          <p className="text-fg-muted text-sm mb-3">{t.dashboard.loadError}</p>
          <button onClick={loadGalleries} className="text-xs text-fg underline underline-offset-2">
            {t.dashboard.retry}
          </button>
        </div>
      )}

      {/* Gallery list */}
      {!loadError && loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border border-line rounded-card overflow-hidden animate-fade-up bg-surface">
              <div className="h-36 bg-surface animate-pulse" />
              <div className="p-4 space-y-2.5">
                <div className="h-4 bg-surface-2 rounded-lg w-3/4 animate-pulse" />
                <div className="h-3 bg-surface rounded w-1/2 animate-pulse" />
                <div className="h-8 bg-surface rounded-xl w-full mt-1 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : !loadError ? (
        <GalleryList galleries={filteredAndSorted} onCreate={() => setShowForm(true)} onDelete={handleDelete} onUpdate={handleUpdate} />
      ) : null}
    </div>
  );
}
