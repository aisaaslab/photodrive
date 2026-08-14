"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "offer_deadline";
const DURATION_MS = 72 * 60 * 60 * 1000;

interface Props {
  label: string; // e.g. "Offer expires in" translated
}

export function CountdownTimer({ label }: Props) {
  const [timeLeft, setTimeLeft] = useState<{ h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    let deadline = Number(localStorage.getItem(STORAGE_KEY));
    if (!deadline || deadline < Date.now()) {
      deadline = Date.now() + DURATION_MS;
      localStorage.setItem(STORAGE_KEY, String(deadline));
    }

    function tick() {
      const diff = Math.max(0, deadline - Date.now());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft({ h, m, s });
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!timeLeft) return null;

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex items-center justify-center gap-2 text-xs text-white/70 mb-3">
      <svg className="w-3.5 h-3.5 text-[#33A39A] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
      </svg>
      <span>{label}</span>
      <span className="font-mono font-bold text-[#33A39A] text-sm tabular-nums">
        {pad(timeLeft.h)}:{pad(timeLeft.m)}:{pad(timeLeft.s)}
      </span>
    </div>
  );
}
