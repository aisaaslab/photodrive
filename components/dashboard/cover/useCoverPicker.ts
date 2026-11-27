"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { GalleryDoc } from "@/lib/firestore/types";
import { COVER_POS_DEFAULT, coverHasChanges, coverSaveValues, coverWarnings, validCoverPos } from "@/lib/gallery/cover-position";
import type { CoverSaved, PickerPhoto, Pos } from "./types";

/**
 * The cover picker's state and its two requests (S5-10): the gallery's photos (GET) and the chosen cover with its focal point (PATCH).
 * The selection is local until Save; `null` means "no cover" (the gradient fallback).
 */
export function useCoverPicker(gallery: GalleryDoc, onSaved: (cover: CoverSaved) => void) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<PickerPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Local selection — NOT saved yet. Initialized to the gallery's current cover so the user sees what's set.
  const [selectedId, setSelectedId] = useState<string | null>(gallery.coverFileId ?? null);
  const [saving, setSaving] = useState(false);
  // Focal point of the cover (percent). Starts at what's saved (centered when never adjusted) and resets to centered when a
  // different photo is chosen.
  const savedPos: Pos = {
    x: validCoverPos(gallery.coverPosX) ?? COVER_POS_DEFAULT,
    y: validCoverPos(gallery.coverPosY) ?? COVER_POS_DEFAULT,
  };
  const [pos, setPos] = useState<Pos>(savedPos);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(false);
    user
      .getIdToken()
      .then((token) =>
        fetch(`/api/galleries/${gallery.id}/photos`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data: { photos: PickerPhoto[] }) => setPhotos(data.photos ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user, gallery.id]);

  const hasChanges = coverHasChanges(selectedId, gallery.coverFileId, pos, savedPos);

  function selectPhoto(id: string | null) {
    setSelectedId(id);
    // Back on the saved cover → restore its saved position; any other photo starts centered.
    setPos(id !== null && id === gallery.coverFileId ? savedPos : { x: COVER_POS_DEFAULT, y: COVER_POS_DEFAULT });
  }

  const selectedPhoto = photos.find((p) => p.id === selectedId) ?? null;
  const { lowRes, portrait } = coverWarnings(selectedPhoto);

  async function handleSave() {
    if (!user || !hasChanges) return;
    setSaving(true);
    setError(false);
    try {
      const token = await user.getIdToken();
      const values = coverSaveValues(selectedId, pos);
      const res = await fetch(`/api/galleries/${gallery.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error();
      onSaved(values);
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  return { photos, loading, error, selectedId, selectedPhoto, pos, setPos, saving, hasChanges, lowRes, portrait, selectPhoto, handleSave };
}
