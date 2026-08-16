"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export function LogoLink() {
  const pathname = usePathname();
  const logo = (
    <Image
      src="/logo.png"
      alt="PhotoDrive"
      width={240}
      height={56}
      className="h-12 w-auto"
      priority
    />
  );

  if (pathname === "/") {
    return (
      <a
        href="#top"
        onClick={(e) => {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        {logo}
      </a>
    );
  }

  return (
    <Link href="/">
      {logo}
    </Link>
  );
}
