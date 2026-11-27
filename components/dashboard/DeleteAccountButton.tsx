"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { Modal } from "@/components/ui/Modal";

export function DeleteAccountButton({ variant = "link" }: { variant?: "link" | "danger" }) {
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
        className={variant === "danger"
          ? "inline-flex h-11 items-center rounded-pill border border-danger/40 bg-danger/10 px-6 text-sm font-bold text-danger transition-colors hover:bg-danger/20"
          : "text-xs text-fg-muted hover:text-danger transition-colors"}
      >
        {c.trigger}
      </button>

      {show && (
        <Modal ariaLabel={c.title} onClose={() => { if (!deleting) setShow(false); }} className="bg-surface border border-line rounded-card shadow-2xl max-w-sm w-full p-6 animate-scale-in">
            <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="font-semibold text-fg text-center mb-1.5">{c.title}</h3>
            <p className="text-sm text-fg-soft text-center mb-6 leading-relaxed">{c.body}</p>
            {error && <p className="text-xs text-danger text-center mb-4">{error}</p>}
            <div className="flex gap-2.5">
              <button
                onClick={() => setShow(false)}
                disabled={deleting}
                className="flex-1 border border-line text-fg-soft rounded-xl py-2.5 text-sm font-medium hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                {c.cancel}
              </button>
              <button
                onClick={confirmDeleteAccount}
                disabled={deleting}
                className="flex-1 bg-red-500 text-fg rounded-xl py-2.5 text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting
                  ? <div className="w-4 h-4 border-2 border-fg-muted/40 border-t-white rounded-full animate-spin" />
                  : c.confirm
                }
              </button>
            </div>
        </Modal>
      )}
    </>
  );
}
