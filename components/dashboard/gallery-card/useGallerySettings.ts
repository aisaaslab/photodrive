"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import type { GalleryDoc } from "@/lib/firestore/types";
import { buildSettingsPatch, settingsAfterSave, settingsFrom, settingsProblem, type SettingsValues } from "@/lib/gallery/gallery-settings";

/**
 * A gallery's settings dialog: its values, Save (PATCH) and Cancel (S5-07). The values start from the gallery once and are not
 * re-synced when the gallery prop changes; Cancel puts back what the gallery has now. What is sent, and when Save is refused, are the
 * pure functions in lib/gallery/gallery-settings.ts.
 */
export function useGallerySettings(gallery: GalleryDoc, onUpdate: (updated: GalleryDoc) => void) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const c = t.galleryCard;
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState<SettingsValues>(() => settingsFrom(gallery));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function save() {
    if (!values.name.trim()) return;
    if (!user) return;
    const problem = settingsProblem(values, gallery);
    if (problem) {
      setError(c[problem]);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/galleries/${gallery.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildSettingsPatch(values, gallery)),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? c.error);
        return;
      }
      const updated = await res.json();
      onUpdate({ ...gallery, ...updated });
      toast(c.savedToast);
      setIsEditing(false);
      setValues((v) => settingsAfterSave(v, updated));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setIsEditing(false);
    setValues(settingsFrom(gallery));
    setError("");
  }

  return { isEditing, open: () => setIsEditing(true), values, set, saving, error, setError, save, cancel };
}
