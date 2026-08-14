"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";

export function DeleteAccountButton() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const c = t.deleteAccount;
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function confirmDeleteAccount() {
    if (!user) return;
    setDeleting(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/user/delete", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      await signOut(auth);
      router.push("/");
    } catch {
      setError(c.error);
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setShow(true)}
        className="text-xs text-stone-600 hover:text-red-400 transition-colors"
      >
        {c.trigger}
      </button>

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-scale-in">
            <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="font-semibold text-white text-center mb-1.5">{c.title}</h3>
            <p className="text-sm text-white/70 text-center mb-6 leading-relaxed">{c.body}</p>
            {error && <p className="text-xs text-red-400 text-center mb-4">{error}</p>}
            <div className="flex gap-2.5">
              <button
                onClick={() => setShow(false)}
                disabled={deleting}
                className="flex-1 border border-white/10 text-stone-300 rounded-xl py-2.5 text-sm font-medium hover:bg-white/[0.06] transition-colors disabled:opacity-50"
              >
                {c.cancel}
              </button>
              <button
                onClick={confirmDeleteAccount}
                disabled={deleting}
                className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : c.confirm
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
