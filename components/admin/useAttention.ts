"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export type Attention = { payments: number; supportUnread: number; supportOpen: number; total: number };

/**
 * The live "needs attention" counts (S8-04): payment items to review and unread support messages. Read when the screen opens and every
 * minute after that, and again whenever the tab becomes visible. `null` until the first answer (or if it cannot be read: no badge, no error).
 */
export function useAttention(everyMs = 60000): Attention | null {
  const { user } = useAuth();
  const [value, setValue] = useState<Attention | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const read = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/admin/attention", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!res.ok || cancelled) return;
        setValue(await res.json());
      } catch { /* leave the last numbers */ }
    };
    void read();
    const t = setInterval(read, everyMs);
    const onVisible = () => { if (document.visibilityState === "visible") void read(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [user, everyMs]);

  return value;
}
