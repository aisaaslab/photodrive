"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export function LogoLink() {
  const pathname = usePathname();

  if (pathname === "/") {
    return (
      <a
        href="#top"
        className="font-bold text-white text-lg"
        style={{ fontFamily: "var(--font-brand), sans-serif" }}
        onClick={(e) => {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        Galleroo
      </a>
    );
  }

  return (
    <Link
      href="/"
      className="font-bold text-white text-lg"
      style={{ fontFamily: "var(--font-brand), sans-serif" }}
    >
      Galleroo
    </Link>
  );
}
