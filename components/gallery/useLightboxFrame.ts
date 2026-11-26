"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { MAX_ZOOM } from "@/lib/gallery/lightbox-math";

/**
 * The lightbox's window-level behaviour (S5-10): focus moves into the dialog and is handed back on close, fullscreen, the keyboard
 * (Esc, arrows, F, + / - / 0, Space) and the page not scrolling behind it.
 */
export function useLightboxFrame({
  onClose, onNext, onPrev, toggleSlideshow, zoomStepRef, isVideoRef,
}: {
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  toggleSlideshow: () => void;
  zoomStepRef: MutableRefObject<(factor: number) => void>;
  isVideoRef: MutableRefObject<boolean>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Dialog focus management: move focus into the viewer, give it back on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    containerRef.current?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "f" || e.key === "F") toggleFullscreen();
      if (!isVideoRef.current) {
        if (e.key === "+" || e.key === "=") zoomStepRef.current(1.5);
        if (e.key === "-" || e.key === "_") zoomStepRef.current(1 / 1.5);
        if (e.key === "0") zoomStepRef.current(1 / MAX_ZOOM);
      }
      // Spacebar toggles the slideshow. preventDefault stops the page from
      // scrolling (the lightbox already locks body overflow, but a button might
      // be focused and would otherwise get a click on space).
      if (e.key === " ") {
        e.preventDefault();
        toggleSlideshow();
      }
    },
    [onClose, onNext, onPrev, toggleFullscreen, toggleSlideshow, zoomStepRef, isVideoRef]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [handleKey]);

  return { containerRef, isFullscreen, toggleFullscreen };
}
