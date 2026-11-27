"use client";

import { useEffect, useState } from "react";

/**
 * The gallery's name in the sticky header, shown once the hero (which carries the big title) has scrolled out of view, so a client deep in
 * a long gallery still sees which one it is. Decorative (the page's one <h1> is in the hero), hence aria-hidden.
 */
export function HeaderTitle({ name, heroId }: { name: string; heroId: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // The header is 56 px tall and covers the top of the page: the hero counts as gone once its bottom edge is behind the header.
    // The hero is looked up on every measurement, not once: while the page streams in, its element can be replaced, and a measurement
    // of a detached element would read as "scrolled away" for good.
    let frame = 0;
    const update = () => {
      frame = 0;
      const hero = document.getElementById(heroId);
      setVisible(!!hero && hero.isConnected && hero.getBoundingClientRect().bottom <= 56);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    // The header can reach the browser before the hero does (the page streams in), and styles or fonts can arrive after the first
    // measurement: keep looking for the hero, watch its size once found, measure again when the page has fully loaded, and re-check
    // a few times in the first seconds, not only when the visitor scrolls.
    let ro: ResizeObserver | null = null;
    let watched: Element | null = null;
    const attach = () => {
      const hero = document.getElementById(heroId);
      if (hero && hero !== watched && typeof ResizeObserver !== "undefined") {
        ro?.disconnect();
        ro = new ResizeObserver(schedule);
        ro.observe(hero);
        watched = hero;
      }
      schedule();
    };
    attach();
    const timers = [150, 400, 1000, 2500].map((ms) => setTimeout(attach, ms));
    window.addEventListener("load", attach);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      timers.forEach(clearTimeout);
      ro?.disconnect();
      window.removeEventListener("load", attach);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [heroId]);

  return (
    <span
      aria-hidden="true"
      data-ui="header-title"
      data-visible={visible}
      className={`min-w-0 flex-1 truncate px-3 text-center text-sm font-semibold text-fg transition-opacity duration-200 motion-reduce:transition-none ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
      style={{ fontFamily: "var(--font-brand), sans-serif" }}
    >
      {name}
    </span>
  );
}
