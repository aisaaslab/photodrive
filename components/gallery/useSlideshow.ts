"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Slideshow (S5-10): auto-advances every 4 s. Spacebar (or the button) toggles it; it auto-stops at the last photo so a gallery
 * doesn't loop forever in a forgotten tab. The interval is cleared on any manual navigation (activeIndex changes) and re-created, so
 * the 4 s timer resets after each advance, giving each photo a full 4 seconds.
 */
export function useSlideshow(activeIndex: number, count: number, onNext: () => void) {
  const [playing, setPlaying] = useState(false);
  const slideRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) {
      if (slideRef.current) clearInterval(slideRef.current);
      return;
    }
    if (activeIndex >= count - 1) {
      // Reached the end while playing — stop, don't loop.
      setPlaying(false);
      return;
    }
    slideRef.current = setInterval(() => {
      onNext();
    }, 4000);
    return () => {
      if (slideRef.current) clearInterval(slideRef.current);
    };
  }, [playing, activeIndex, count, onNext]);

  const toggle = useCallback(() => setPlaying((v) => !v), []);
  return { playing, toggle };
}
