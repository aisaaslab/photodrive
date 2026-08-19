"use client";

import { useState } from "react";

/**
 * Avatar for the public gallery header.
 *
 * The gallery page is a server component, so it can't pass an `onError` handler
 * to an <img> tag (event handlers are client-only). This small client island
 * renders the photographer's avatar and falls back to an initial-letter circle
 * if the image URL is broken (e.g. an expired Google CDN URL or a deleted
 * custom avatar).
 */
interface Props {
  src?: string;
  name: string;
  fallbackLetter?: string;
  size?: number;
}

export function GalleryAvatar({ src, name, fallbackLetter, size = 36 }: Props) {
  const [failed, setFailed] = useState(false);
  const letter = (name?.[0] || fallbackLetter || "P").toUpperCase();

  if (!src || failed) {
    return (
      <div
        className="rounded-full bg-stone-900 text-white flex items-center justify-center font-bold shrink-0"
        style={{ width: size, height: size, fontSize: Math.floor(size * 0.4) }}
      >
        {letter}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      className="rounded-full object-cover ring-1 ring-stone-200 shrink-0"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
