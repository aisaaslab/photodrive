"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { DeleteAccountButton } from "@/components/dashboard/DeleteAccountButton";
import Image from "next/image";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

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
              {user.photoURL ? (
                <Image
                  src={user.photoURL}
                  alt={user.displayName ?? ""}
                  width={30}
                  height={30}
                  className="rounded-full ring-1 ring-white/20"
                />
              ) : (
                <div className="w-7 h-7 bg-white/10 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                  {(user.displayName ?? user.email ?? "?")[0].toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium text-stone-300">{user.displayName ?? user.email}</span>
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
    </div>
  );
}
