"use client";

import { useEffect, useState } from "react";

/**
 * The gallery's name in the sticky header, shown once the hero (which carries the big title) has scrolled out of view, so a client deep in
 * a long gallery still sees which one it is. Decorative (the page's one <h1> is in the hero), hence aria-hidden.
 */
export function HeaderTitle({ name, heroId }: { name: string; heroId: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById(heroId);
    if (!hero) return;
    // The header is 56 px tall and covers the top of the page: the hero counts as gone once its bottom edge is behind the header.
    let frame = 0;
    const update = () => { frame = 0; setVisible(hero.getBoundingClientRect().bottom <= 56); };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (frame) cancelAnimationFrame(frame); };
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
