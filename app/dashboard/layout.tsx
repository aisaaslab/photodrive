"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AvatarEditor } from "@/components/dashboard/AvatarEditor";
import { AccountMenu } from "@/components/dashboard/AccountMenu";
import { ToastProvider } from "@/components/ui/Toast";
import Image from "next/image";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, profile } = useAuth();
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

          <div className="flex items-center gap-2.5 sm:gap-4">
            <LanguageSwitcher variant="dark" />
            <AccountMenu
              name={displayName ?? ""}
              email={user.email}
              avatarUrl={avatarUrl}
              onEditPhoto={() => setAvatarEditorOpen(true)}
              onSignOut={() => signOut(auth).then(() => router.push("/login"))}
            />
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10">
        {children}
      </main>

      {avatarEditorOpen && <AvatarEditor onClose={() => setAvatarEditorOpen(false)} />}
    </div>
    </ToastProvider>
  );
}
