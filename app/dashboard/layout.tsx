"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { DeleteAccountButton } from "@/components/dashboard/DeleteAccountButton";
import { AvatarEditor } from "@/components/dashboard/AvatarEditor";
import { ToastProvider } from "@/components/ui/Toast";
import Image from "next/image";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, profile } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-5 h-5 border-2 border-line border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  // Prefer the Firestore profile's photoURL (custom avatars live there) over
  // Firebase Auth's photoURL (which is the Google profile photo and can't hold
  // a data URL).
  const avatarUrl = profile?.photoURL || user.photoURL || null;
  const displayName = profile?.name || user.displayName || user.email;

  return (
    <ToastProvider>
    <div className="min-h-screen flex flex-col bg-canvas text-fg">
      

      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between" style={{ height: "64px" }}>
          <Link href="/">
            <Image
              src="/logo-light.png"
              alt="PhotoDrive"
              width={240}
              height={56}
              className="h-9 sm:h-12 w-auto"
              priority
            />
          </Link>

          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/dashboard/account"
              className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors"
              title={t.dashboardLayout.account}
              aria-label={t.dashboardLayout.account}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">{t.dashboardLayout.account}</span>
            </Link>

            <LanguageSwitcher variant="dark" />

            <div className="flex items-center gap-3">
              {/* Click avatar to edit — opens the AvatarEditor modal */}
              <button
                onClick={() => setAvatarEditorOpen(true)}
                title={t.gallery.avatar}
                aria-label={t.gallery.avatar}
                className="relative shrink-0"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={displayName ?? ""}
                    className="w-8 h-8 rounded-full object-cover ring-1 ring-fg-muted/30"
                  />
                ) : (
                  <div className="w-8 h-8 bg-surface-2 rounded-full flex items-center justify-center text-xs font-bold text-fg-soft ring-1 ring-fg-muted/30">
                    {(displayName ?? "?")[0].toUpperCase()}
                  </div>
                )}
              </button>
              <span className="hidden sm:inline text-sm font-medium text-fg-soft">{displayName}</span>
            </div>

            <div className="w-px h-4 bg-line hidden sm:block" />

            <button
              onClick={() => signOut(auth).then(() => router.push("/login"))}
              aria-label={t.dashboardLayout.signOut}
              title={t.dashboardLayout.signOut}
              className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              <span className="hidden sm:inline">{t.dashboardLayout.signOut}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10">
        {children}
      </main>

      <footer className="relative z-10 max-w-5xl mx-auto w-full px-4 sm:px-6 pb-8 flex justify-center">
        <DeleteAccountButton />
      </footer>

      {avatarEditorOpen && <AvatarEditor onClose={() => setAvatarEditorOpen(false)} />}
    </div>
    </ToastProvider>
  );
}
