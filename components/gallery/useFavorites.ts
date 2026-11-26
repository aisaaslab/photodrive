"use client";

import { useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { DriveFile } from "@/lib/drive/types";

const SESSION_KEY = "gallery_session_id";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = nanoid();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/**
 * The visitor's favourites for one gallery (S5-08). Kept in localStorage for instant display and shared through
 * /api/galleries/[id]/selection, so everyone who opens the link (and the photographer) sees the same hearts. No account needed.
 */
export function useFavorites(galleryId: string, photos: DriveFile[]) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    getSessionId();
    const key = `favorites_${galleryId}`;
    const stored = localStorage.getItem(key);
    // localStorage cannot be read while rendering on the server, so the saved hearts are applied right after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setFavorites(new Set(JSON.parse(stored)));
    // Shared favourites: load the gallery's selection from the server so anyone
    // who opens the link sees the same favourited photos (and so does the
    // photographer). No account needed.
    fetch(`/api/galleries/${galleryId}/selection`)
      .then((r) => r.json())
      .then((data: { photos?: { id: string }[] }) => {
        const ids = (data.photos ?? []).map((p) => p.id);
        setFavorites(new Set(ids));
        localStorage.setItem(key, JSON.stringify(ids));
      })
      .catch(() => {});
  }, [galleryId]);

  function saveFavorites(next: Set<string>) {
    localStorage.setItem(`favorites_${galleryId}`, JSON.stringify([...next]));
  }

  function toggleFavorite(photoId: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      const adding = !next.has(photoId);
      if (adding) next.add(photoId);
      else next.delete(photoId);
      saveFavorites(next);
      // Update the shared selection on the server so every visitor (and the
      // photographer) sees the change.
      const photo = photos.find((p) => p.id === photoId);
      fetch(`/api/galleries/${galleryId}/selection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: adding ? "add" : "remove",
          item: { id: photoId, name: photo?.name ?? "" },
        }),
        keepalive: true,
      }).catch(() => {});
      return next;
    });
  }

  return { favorites, toggleFavorite };
}
