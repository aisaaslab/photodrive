"use client";

import { useState, useRef } from "react";
import { useAuth, updateUserProfile } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";

/**
 * Modal that lets the photographer upload a custom avatar or paste an image URL.
 *
 * The avatar is stored as a data URL in Firestore (users/{uid}.photoURL). We
 * can't use Firebase Auth's photoURL for this — it has a ~1.5KB limit that a
 * data URL exceeds. Firestore's 1MB document limit is more than enough for a
 * 128×128 JPEG (~5–15KB).
 *
 * On save, updates Firestore directly (allowed by firestore.rules — photoURL
 * is not a locked field) and calls refreshProfile() so the dashboard header
 * updates immediately.
 */
export function AvatarEditor({ onClose }: { onClose: () => void }) {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const [preview, setPreview] = useState<string | null>(profile?.photoURL ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentName = profile?.name || user?.displayName || "";

  // Reads a File, resizes it to 128×128 via canvas, and returns a JPEG data URL.
  // This keeps the stored avatar tiny (~5–15KB) regardless of the source image.
  function processFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("not an image"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const size = 128;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("no canvas context"));
            return;
          }
          // Cover-fit: crop to square, centered.
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => reject(new Error("image load failed"));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error("file read failed"));
      reader.readAsDataURL(file);
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const dataUrl = await processFile(file);
      setPreview(dataUrl);
    } catch {
      setError(t.gallery.connectionError);
    }
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      await updateUserProfile(user.uid, {
        photoURL: preview ?? undefined,
      });
      await refreshProfile();
      onClose();
    } catch {
      setError(t.gallery.connectionError);
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      // Clear the avatar by deleting the field entirely (set to undefined so
      // updateDoc removes it via merge semantics — null would store an actual
      // null value which would show as a broken image).
      await updateUserProfile(user.uid, { photoURL: undefined });
      await refreshProfile();
      onClose();
    } catch {
      setError(t.gallery.connectionError);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/[0.08]">
          <h3 className="font-semibold text-white">{t.gallery.avatar}</h3>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Preview */}
          <div className="flex justify-center">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Avatar preview"
                className="w-24 h-24 rounded-full object-cover ring-2 ring-white/10"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center text-2xl font-bold text-white">
                {currentName?.[0]?.toUpperCase() || "?"}
              </div>
            )}
          </div>

          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl py-2.5 text-sm text-white/80 hover:bg-white/[0.08] hover:border-white/20 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            {t.gallery.uploadAvatar}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08] flex gap-2">
          {preview && (
            <button
              onClick={handleRemove}
              disabled={saving}
              className="flex-1 text-xs font-medium text-white/60 border border-white/10 rounded-lg py-2.5 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50"
            >
              {t.gallery.removeAvatar}
            </button>
          )}
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 text-xs font-medium text-white/70 border border-white/10 rounded-lg py-2.5 hover:bg-white/[0.05] transition-colors disabled:opacity-50"
          >
            {t.gallery.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !preview}
            className="flex-1 text-xs font-semibold bg-white text-stone-900 rounded-lg py-2.5 hover:bg-stone-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" />
            ) : (
              t.gallery.save
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
