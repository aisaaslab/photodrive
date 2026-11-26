"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/ui/cn";

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
            className={cn(
              "pointer-events-auto flex items-center gap-2.5 rounded-pill border px-5 py-3 text-sm font-semibold shadow-chip backdrop-blur-md animate-scale-in motion-reduce:animate-none",
              t.kind === "error" ? "border-danger/40 bg-surface-2/95 text-fg" : "border-line bg-surface-2/95 text-fg",
            )}
          >
            {t.kind === "error"
              ? <AlertCircle aria-hidden className="size-4 shrink-0 text-danger" />
              : <Check aria-hidden strokeWidth={2.5} className="size-4 shrink-0 text-success-bright" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
