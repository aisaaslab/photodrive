"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * Tiny toast system for dashboard feedback ("Link copied", "Changes saved"…).
 * Wrap the area in <ToastProvider>, then call `useToast()(message, kind)`.
 * Without a provider the hook is a no-op, so components stay usable anywhere.
 */
type Kind = "success" | "error";
type Toast = { id: number; message: string; kind: Kind };
type Push = (message: string, kind?: Kind) => void;

const ToastContext = createContext<Push>(() => {});

export function useToast(): Push {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const push = useCallback<Push>((message, kind = "success") => {
    const id = nextId.current++;
    // Keep at most 3 on screen; the oldest drops off first.
    setToasts((prev) => [...prev.slice(-2), { id, message, kind }]);
    timers.current.set(
      id,
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timers.current.delete(id);
      }, 3200)
    );
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="fixed bottom-5 inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur-md animate-scale-in ${
              t.kind === "error"
                ? "bg-red-950/90 border-red-500/30 text-red-200"
                : "bg-[#111111]/95 border-white/15 text-white"
            }`}
          >
            {t.kind === "error" ? (
              <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
