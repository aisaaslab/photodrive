"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n";

interface Props {
  photoId: string;
  isFavorited: boolean;
  onToggle: (photoId: string) => void;
}

export function FavoriteButton({ photoId, isFavorited, onToggle }: Props) {
  const { t } = useLanguage();
  const [animating, setAnimating] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isFavorited) {
      setAnimating(true);
      setTimeout(() => setAnimating(false), 350);
    }
    onToggle(photoId);
  }

  return (
    <button
      onClick={handleClick}
      className={`absolute top-2.5 right-2.5 w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200 shadow-sm ${
        isFavorited
          ? "bg-[#17509e] text-white opacity-100 scale-100"
          : "bg-black/30 backdrop-blur-sm text-white/60 hover:bg-black/60"
      } ${animating ? "animate-heart-pop" : ""}`}
      aria-label={isFavorited ? t.gallery.removeFavorite : t.gallery.addFavorite}
    >
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill={isFavorited ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={isFavorited ? 0 : 2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    </button>
  );
}
