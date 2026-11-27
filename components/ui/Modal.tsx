"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Accessible modal shell used by the dashboard dialogs.
 *
 * Provides what every dialog needs and the ad-hoc ones were missing:
 *  - role="dialog" + aria-modal, labelled by `ariaLabel`
 *  - Escape closes (only the top-most dialog when several are stacked)
 *  - focus moves into the dialog on open, is trapped on Tab, and returns to
 *    the element that opened it on close
 *  - background scroll is locked while open
 *  - clicking the backdrop closes (opt out with `dismissOnBackdrop={false}`)
 */

// Stack of open modals so Escape only closes the top-most one.
const stack: symbol[] = [];
// Body overflow before the first modal opened, restored when the last closes.
let savedOverflow = "";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  onClose: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  /** Classes for the dialog panel (size, background, border…). */
  className?: string;
  dismissOnBackdrop?: boolean;
  /** "end" docks the panel to the right edge, full height (a detail drawer); the default is a centred dialog. */
  align?: "center" | "end";
}

export function Modal({ onClose, ariaLabel, children, className = "", dismissOnBackdrop = true, align = "center" }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the mount effect (parents pass
  // inline arrow functions).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const id = Symbol("modal");
    if (stack.length === 0) savedOverflow = document.body.style.overflow;
    stack.push(id);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    // Focus the first control inside the dialog (or the panel itself).
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus({ preventScroll: true });

    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === panel)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      // Only release the scroll lock when no other modal is still open.
      if (stack.length === 0) document.body.style.overflow = savedOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, []);

  const tree = (
    <div
      className={`fixed inset-0 z-50 flex bg-canvas/70 backdrop-blur-sm animate-fade-in motion-reduce:animate-none ${align === "end" ? "justify-end items-stretch" : "items-center justify-center p-4"}`}
      onClick={dismissOnBackdrop ? () => onCloseRef.current() : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`outline-none ${align === "end" ? "animate-fade-in" : "animate-scale-in"} motion-reduce:animate-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
  // Rendered on <body>, not where it was declared: the dashboard's <main> is its own stacking context below the sticky header, which
  // would otherwise paint over the top of a modal (and hide a drawer's close button).
  return typeof document === "undefined" ? tree : createPortal(tree, document.body);
}
