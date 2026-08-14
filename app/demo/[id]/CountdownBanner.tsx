"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";

export function CountdownBanner({ expiresAt }: { expiresAt: number }) {
  const { t } = useLanguage();
  const d = t.demo;
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  );

  useEffect(() => {
    if (secondsLeft <= 0) {
      window.location.reload();
      return;
    }
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        const next = s - 1;
        if (next <= 0) {
          clearInterval(interval);
          window.location.reload();
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div className="bg-stone-900 text-white text-sm font-medium text-center py-3 px-4 flex items-center justify-center gap-3 flex-wrap">
      <span>
        {d.bannerExpires}{" "}
        <span className="font-bold text-[#33A39A]">{timeStr}</span>
      </span>
      <Link
        href="/login"
        className="text-white/60 hover:text-white text-xs underline transition-colors"
      >
        {d.bannerCta}
      </Link>
    </div>
  );
}
