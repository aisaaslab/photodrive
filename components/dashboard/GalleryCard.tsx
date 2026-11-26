"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { GalleryDoc } from "@/lib/firestore/types";
import { useToast } from "@/components/ui/Toast";
import { galleryUrl } from "@/lib/gallery/gallery-settings";
import { CoverPickerModal } from "./CoverPickerModal";
import { GalleryCardFace } from "./gallery-card/GalleryCardFace";
import { GallerySettingsModal } from "./gallery-card/GallerySettingsModal";
import { GallerySelectionsModal } from "./gallery-card/GallerySelectionsModal";
import { DeleteGalleryModal } from "./gallery-card/DeleteGalleryModal";
import { useGallerySettings } from "./gallery-card/useGallerySettings";
import { useGallerySelections } from "./gallery-card/useGallerySelections";

interface Props {
  gallery: GalleryDoc;
  onDelete: (id: string) => void | boolean | Promise<void | boolean>;
  onUpdate: (updated: GalleryDoc) => void;
}

/**
 * One gallery in the dashboard list, with everything the photographer can do to it. The pieces live in gallery-card/ (S5-07): the card
 * face, the settings dialog (its values and Save in useGallerySettings, its rules in lib/gallery/gallery-settings.ts), the client's
 * favourites panel (useGallerySelections), and the delete confirmation. This file holds the few things they share.
 */
export function GalleryCard({ gallery, onDelete, onUpdate }: Props) {
  const { t } = useLanguage();
  const c = t.galleryCard;
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const settings = useGallerySettings(gallery, onUpdate);
  const selections = useGallerySelections(gallery);

  function copyLink() {
    navigator.clipboard.writeText(galleryUrl(gallery));
    toast(c.linkCopied);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function confirmDelete() {
    setDeleting(true);
    const ok = await onDelete(gallery.id);
    setDeleting(false);
    setShowDeleteConfirm(false);
    if (ok !== false) toast(c.deletedToast);
  }

  return (
    <>
      <GalleryCardFace
        gallery={gallery}
        copied={copied}
        hasNewSelections={selections.hasNew}
        onChooseCover={() => setShowCoverPicker(true)}
        onCopyLink={copyLink}
        onOpenSelections={selections.openSelections}
        onEdit={settings.open}
        onDelete={() => setShowDeleteConfirm(true)}
      />

      {settings.isEditing && <GallerySettingsModal gallery={gallery} settings={settings} onChooseCover={() => setShowCoverPicker(true)} />}

      {selections.showSelections && <GallerySelectionsModal gallery={gallery} selections={selections} onClose={selections.close} />}

      {showDeleteConfirm && (
        <DeleteGalleryModal gallery={gallery} deleting={deleting} onCancel={() => setShowDeleteConfirm(false)} onConfirm={confirmDelete} />
      )}

      {showCoverPicker && (
        <CoverPickerModal
          gallery={gallery}
          onClose={() => setShowCoverPicker(false)}
          onSaved={(cover) => {
            onUpdate({ ...gallery, ...cover });
            setShowCoverPicker(false);
            toast(c.coverSaved);
          }}
        />
      )}
    </>
  );
}
