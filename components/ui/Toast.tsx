"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, X } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { useLanguage } from "@/lib/i18n";

/**
 * Toast system for dashboard feedback ("Link copied", "Changes saved", "Gallery deleted · Undo"…).
 * Wrap the area in <ToastProvider>, then call `useToast()(message, kind, options)`.
 * Without a provider the hook is a no-op, so components stay usable anywhere.
 *
 * - Success toasts last 3.2 s, errors 7 s (people need longer to read what went wrong); `duration` overrides.
 * - The timer pauses while the pointer is over a toast or focus is inside it, and every toast has a Dismiss button.
 * - `action` adds a button (for example Undo); pressing it runs the callback and closes the toast.
 * - Successes are announced politely, errors assertively (separate live regions).
 */
type Kind = "success" | "error";
export type ToastOptions = { action?: { label: string; onClick: () => void }; duration?: number };
type Toast = { id: number; message: string; kind: Kind; action?: ToastOptions["action"]; duration: number };
type Push = (message: string, kind?: Kind, options?: ToastOptions) => void;

const ToastContext = createContext<Push>(() => {});

export function useToast(): Push {
  return useContext(ToastContext);
}

const DURATION = { success: 3200, error: 7000 };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const arm = useCallback((id: number, ms: number) => {
    const old = timers.current.get(id);
    if (old) clearTimeout(old);
    timers.current.set(id, setTimeout(() => dismiss(id), ms));
  }, [dismiss]);

  const push = useCallback<Push>((message, kind = "success", options) => {
    const id = nextId.current++;
    const duration = options?.duration ?? DURATION[kind];
    // Keep at most 3 on screen; the oldest drops off first.
    setToasts((prev) => {
      const next = [...prev, { id, message, kind, action: options?.action, duration }];
      for (const dropped of next.slice(0, -3)) { const t = timers.current.get(dropped.id); if (t) clearTimeout(t); timers.current.delete(dropped.id); }
      return next.slice(-3);
    });
    arm(id, duration);
  }, [arm]);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const pause = (id: number) => { const t = timers.current.get(id); if (t) clearTimeout(t); timers.current.delete(id); };
  const resume = (t: Toast) => arm(t.id, Math.min(t.duration, 3000)); // a short grace after the pointer leaves

  const render = (list: Toast[], role: "status" | "alert") => (
    <div className="flex flex-col items-center gap-2" role={role} aria-live={role === "alert" ? "assertive" : "polite"}>
      {list.map((t) => <ToastItem key={t.id} toast={t} onDismiss={dismiss} onPause={pause} onResume={resume} />)}
    </div>
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-2 px-4">
        {render(toasts.filter((t) => t.kind === "success"), "status")}
        {render(toasts.filter((t) => t.kind === "error"), "alert")}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast: t, onDismiss, onPause, onResume }: { toast: Toast; onDismiss: (id: number) => void; onPause: (id: number) => void; onResume: (t: Toast) => void }) {
  const { t: tr } = useLanguage();
  return (
    <div
      data-ui="toast"
      data-kind={t.kind}
      onPointerEnter={() => onPause(t.id)}
      onPointerLeave={() => onResume(t)}
      onFocus={() => onPause(t.id)}
      onBlur={() => onResume(t)}
      className={cn(
        "pointer-events-auto flex max-w-[min(92vw,34rem)] items-center gap-2.5 rounded-pill border py-2.5 pl-5 pr-2 text-sm font-semibold shadow-chip backdrop-blur-md animate-scale-in motion-reduce:animate-none",
        t.kind === "error" ? "border-danger/40 bg-surface-2/95 text-fg" : "border-line bg-surface-2/95 text-fg",
      )}
    >
      {t.kind === "error"
        ? <AlertCircle aria-hidden className="size-4 shrink-0 text-danger" />
        : <Check aria-hidden strokeWidth={2.5} className="size-4 shrink-0 text-success-bright" />}
      <span className="min-w-0 break-words">{t.message}</span>
      {t.action && (
        <button
          type="button"
          onClick={() => { t.action!.onClick(); onDismiss(t.id); }}
          className="shrink-0 rounded-pill px-3 py-1.5 text-sm font-bold text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(t.id)}
        aria-label={tr.dashboard.toastDismiss}
        className="grid size-8 shrink-0 place-items-center rounded-full text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
