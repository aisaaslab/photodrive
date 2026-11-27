"use client";

import { useEffect, useRef, useState } from "react";

// Photos rendered per "page". Big galleries (1,000+ photos) would otherwise mount every tile up front; instead PAGE_SIZE are rendered
// at a time and more are added as the visitor scrolls (with a button as a fallback).
export const PAGE_SIZE = 120;

/**
 * Progressive rendering (S5-08). The window resets whenever `key` changes (keyed, so no effect is needed to reset it). Load the next
 * page when the sentinel below the grid nears the viewport; the effect re-subscribes after each page, so it keeps loading until the
 * sentinel is far enough below the fold.
 */
export function useProgressiveLimit<T>(items: T[], key: string) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [limitState, setLimitState] = useState({ key, n: PAGE_SIZE });
  const limit = limitState.key === key ? limitState.n : PAGE_SIZE;
  const shown = items.slice(0, limit);
  const hasMore = items.length > shown.length;
  const remaining = items.length - shown.length;

  function showMore() {
    setLimitState((st) => ({ key, n: (st.key === key ? st.n : PAGE_SIZE) + PAGE_SIZE }));
  }

  useEffect(() => {
    const el = sentinelRef.current;
    if (!hasMore || !el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLimitState((st) => ({ key, n: (st.key === key ? st.n : PAGE_SIZE) + PAGE_SIZE }));
        }
      },
      { rootMargin: "1200px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, limit, key]);

  return { shown, hasMore, remaining, showMore, sentinelRef };
}
