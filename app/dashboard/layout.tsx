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
      <div className="min-h-screen flex items-center justify-center bg-[#080808]">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  // Prefer the Firestore profile's photoURL (custom avatars live there) over
  // Firebase Auth's photoURL (which is the Google profile photo and can't hold
  // a data URL).
  const avatarUrl = profile?.photoURL || user.photoURL || null;
  const displayName = profile?.name || user.displayName || user.email;

  return (
    <div className="min-h-screen flex flex-col bg-[#080808] text-white">
      <div className="aurora-bg"><span /></div>

      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#080808]/85 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between" style={{ height: "64px" }}>
          <Link href="/">
            <Image
              src="/logo.png"
              alt="PhotoDrive"
              width={240}
              height={56}
              className="h-12 w-auto"
              priority
            />
          </Link>

          <div className="flex items-center gap-4">
            <LanguageSwitcher />

            <div className="hidden sm:flex items-center gap-3">
              {/* Click avatar to edit — opens the AvatarEditor modal */}
              <button
                onClick={() => setAvatarEditorOpen(true)}
                title={t.gallery.avatar}
                className="relative shrink-0"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={displayName ?? ""}
                    className="w-8 h-8 rounded-full object-cover ring-1 ring-white/20"
                  />
                ) : (
                  <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-xs font-semibold text-white ring-1 ring-white/20">
                    {(displayName ?? "?")[0].toUpperCase()}
                  </div>
                )}
              </button>
              <span className="text-sm font-medium text-stone-300">{displayName}</span>
            </div>

            <div className="w-px h-4 bg-white/10 hidden sm:block" />

            <button
              onClick={() => signOut(auth).then(() => router.push("/login"))}
              className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-white transition-colors"
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
  );
}
