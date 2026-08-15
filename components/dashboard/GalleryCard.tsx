"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n";
import { GalleryDoc } from "@/lib/firestore/types";
import { APP_URL } from "@/lib/branding";

interface Props {
  gallery: GalleryDoc;
  onDelete: (id: string) => void;
  onUpdate: (updated: GalleryDoc) => void;
}

const SOCIAL_FIELDS = [
  { key: "website", placeholder: "https://yoursite.com",
    icon: (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M3.5 12h17M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" /></svg>) },
  { key: "instagram", placeholder: "https://instagram.com/username",
    icon: (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="3.8" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" /></svg>) },
  { key: "facebook", placeholder: "https://facebook.com/yourpage",
    icon: (<svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0022 12z" /></svg>) },
] as const;

export function GalleryCard({ gallery, onDelete, onUpdate }: Props) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const c = t.galleryCard;
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(gallery.name);
  const [editDriveUrl, setEditDriveUrl] = useState(`https://drive.google.com/drive/folders/${gallery.folderId}`);
  const [editPassword, setEditPassword] = useState(gallery.password ?? "");
  const [removePassword, setRemovePassword] = useState(false);
  const [editAllowDownload, setEditAllowDownload] = useState(gallery.allowDownload !== false);
  const [editSocial, setEditSocial] = useState({
    website: gallery.website ?? "",
    instagram: gallery.instagram ?? "",
    facebook: gallery.facebook ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [showSelections, setShowSelections] = useState(false);
  const [selLoading, setSelLoading] = useState(false);
  const [selPhotos, setSelPhotos] = useState<{ id: string; name: string; count?: number }[]>([]);
  const [selError, setSelError] = useState(false);
  const [selCopied, setSelCopied] = useState(false);
  const [selZipping, setSelZipping] = useState(false);

  const galleryUrl = `${APP_URL}/gallery/${gallery.slug}`;

  async function openSelections() {
    setShowSelections(true);
    setSelLoading(true);
    setSelError(false);
    try {
      const res = await fetch(`/api/galleries/${gallery.id}/selection`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelPhotos(data.photos ?? []);
    } catch {
      setSelError(true);
    } finally {
      setSelLoading(false);
    }
  }

  function copySelectionList() {
    navigator.clipboard.writeText(selPhotos.map((p) => p.name).join("\n"));
    setSelCopied(true);
    setTimeout(() => setSelCopied(false), 2000);
  }

  async function downloadSelectionFiles() {
    if (selZipping || selPhotos.length === 0) return;
    setSelZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      // Fetch in small batches; skip any file that fails instead of aborting.
      const CONCURRENCY = 4;
      for (let i = 0; i < selPhotos.length; i += CONCURRENCY) {
        const batch = selPhotos.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map(async (p) => {
            try {
              const res = await fetch(`/api/photos/proxy?fileId=${p.id}&size=full`);
              if (res.ok) zip.file(p.name || `${p.id}.jpg`, await res.blob());
            } catch {
              // skip
            }
          })
        );
      }
      // STORE: no recompression (photos are already compressed).
      const content = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = `${gallery.name || "selection"}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setSelZipping(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(galleryUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function confirmDelete() {
    setDeleting(true);
    await onDelete(gallery.id);
    setDeleting(false);
    setShowDeleteConfirm(false);
  }

  async function saveEdit() {
    if (!editName.trim()) return;
    if (!user) return;
    setSaving(true);
    setEditError("");
    try {
      const token = await user.getIdToken();
      const body: Record<string, unknown> = { name: editName.trim() };
      if (editPassword) body.password = editPassword;
      if (removePassword) body.removePassword = true;
      body.website = editSocial.website.trim();
      body.instagram = editSocial.instagram.trim();
      body.facebook = editSocial.facebook.trim();
      body.allowDownload = editAllowDownload;

      const res = await fetch(`/api/galleries/${gallery.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setEditError(data.error ?? c.error);
        return;
      }
      const updated = await res.json();
      onUpdate({ ...gallery, ...updated });
      setIsEditing(false);
      setEditDriveUrl("");
      setEditPassword("");
      setRemovePassword(false);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditName(gallery.name);
    setEditDriveUrl(`https://drive.google.com/drive/folders/${gallery.folderId}`);
    setEditPassword(gallery.password ?? "");
    setRemovePassword(false);
    setEditAllowDownload(gallery.allowDownload !== false);
    setEditSocial({ website: gallery.website ?? "", instagram: gallery.instagram ?? "", facebook: gallery.facebook ?? "" });
    setEditError("");
  }

  const LOCALES: Record<import("@/lib/i18n").Lang, string> = { el: "el-GR", en: "en-GB", nl: "nl-NL", de: "de-DE", es: "es-ES", it: "it-IT" };
  const createdDate = gallery.createdAt
    ? new Date(gallery.createdAt).toLocaleDateString(LOCALES[lang], {
        day: "numeric", month: "short", year: "numeric",
      })
    : null;

  return (
    <>
      <div className="bg-[#111111] border border-white/[0.08] rounded-2xl overflow-hidden hover:border-white/[0.18] transition-all duration-200 group animate-fade-up">
        <div className="p-4">
          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-white/70 mb-1 block">{c.nameLabel}</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/25 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-white/40 mb-1 block">{c.driveFolderLabel}</label>
                <div className="relative group/drive">
                  <input
                    value={editDriveUrl}
                    readOnly
                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white/30 outline-none cursor-not-allowed pr-8"
                  />
                  <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                  <div className="absolute left-0 -top-8 hidden group-hover/drive:flex bg-stone-800 border border-white/10 text-white/70 text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg z-10">
                    {c.driveTooltip}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-white/70 mb-1 block">
                  {gallery.passwordHash ? c.newPasswordLabel : c.passwordOptionalLabel}
                </label>
                <input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  disabled={removePassword}
                  placeholder={gallery.password ?? c.noPassword}
                  className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/25 transition-all disabled:opacity-40 placeholder-stone-600"
                />
              </div>

              {gallery.passwordHash && (
                <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={removePassword}
                    onChange={(e) => {
                      setRemovePassword(e.target.checked);
                      if (e.target.checked) setEditPassword("");
                    }}
                    className="rounded border-white/20"
                  />
                  {c.removePassword}
                </label>
              )}

              <div>
                <label className="text-xs font-medium text-white/70 mb-1 block">{c.linksLabel}</label>
                <div className="space-y-2">
                  {SOCIAL_FIELDS.map((soc) => (
                    <div key={soc.key} className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40">{soc.icon}</span>
                      <input
                        type="url"
                        value={editSocial[soc.key]}
                        onChange={(e) => setEditSocial((s) => ({ ...s, [soc.key]: e.target.value } as typeof s))}
                        placeholder={soc.placeholder}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-white/25 transition-all placeholder-stone-600"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={editAllowDownload}
                  onChange={(e) => setEditAllowDownload(e.target.checked)}
                  className="mt-0.5 rounded border-white/20"
                />
                <span>
                  <span className="block text-xs font-medium text-white/80">{c.allowDownloadLabel}</span>
                  <span className="block text-[11px] text-white/40 mt-0.5">{c.allowDownloadHint}</span>
                </span>
              </label>

              {editError && <p className="text-xs text-red-500">{editError}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveEdit}
                  disabled={saving || !editName.trim()}
                  className="flex-1 bg-white text-stone-900 rounded-lg py-2 text-xs font-semibold hover:bg-stone-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {saving
                    ? <div className="w-3.5 h-3.5 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" />
                    : c.save
                  }
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  className="flex-1 border border-white/10 text-white/70 rounded-lg py-2 text-xs font-medium hover:bg-white/[0.05] transition-colors disabled:opacity-50"
                >
                  {c.cancel}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-semibold text-white text-sm leading-snug truncate">{gallery.name}</h3>
                {gallery.passwordHash && !removePassword && (
                  <button
                    onClick={() => setShowPassword((v) => !v)}
                    className="shrink-0 bg-white/[0.06] text-white/70 text-xs px-2 py-0.5 rounded-full flex items-center gap-1 border border-white/10 hover:bg-white/[0.10] transition-colors"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    {showPassword && gallery.password
                      ? <span className="font-mono tracking-wider">{gallery.password}</span>
                      : c.password
                    }
                  </button>
                )}
              </div>
              {createdDate && (
                <p className="text-xs text-white/50 mt-0.5 mb-3">{createdDate}</p>
              )}

              <div className="flex gap-1.5">
                <button
                  onClick={copyLink}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs rounded-lg py-2 transition-all font-medium border ${
                    copied
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-white/10 text-white hover:bg-white/[0.06] hover:border-white/20"
                  }`}
                >
                  {copied ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {c.copied}
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                      </svg>
                      {c.copyLink}
                    </>
                  )}
                </button>

                <a
                  href={galleryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={c.openGallery}
                  className="shrink-0 flex items-center justify-center border border-white/10 text-white/70 rounded-lg px-3 py-2 hover:bg-white/[0.06] hover:border-white/20 hover:text-white transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>

                <button
                  onClick={openSelections}
                  title={c.selections}
                  className="shrink-0 flex items-center justify-center border border-white/10 text-white/70 rounded-lg px-3 py-2 hover:bg-[#17509e]/15 hover:border-[#17509e]/40 hover:text-[#2dabe0] transition-all"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                  </svg>
                </button>

                <button
                  onClick={() => setIsEditing(true)}
                  title={c.edit}
                  className="shrink-0 flex items-center justify-center border border-white/10 text-white/70 rounded-lg px-3 py-2 hover:bg-white/[0.06] hover:border-white/20 hover:text-white transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>

                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  title={c.delete}
                  className="shrink-0 flex items-center justify-center border border-white/10 text-white/70 rounded-lg px-3 py-2 hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showSelections && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setShowSelections(false)}>
          <div className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between p-5 border-b border-white/[0.08]">
              <div>
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#2dabe0]" viewBox="0 0 24 24" fill="currentColor"><path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
                  {c.selectionsTitle}
                </h3>
                <p className="text-xs text-white/50 mt-0.5 truncate max-w-[18rem]">{gallery.name}</p>
              </div>
              <button onClick={() => setShowSelections(false)} className="text-white/50 hover:text-white transition-colors shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {selLoading ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              ) : selError ? (
                <p className="text-sm text-white/50 text-center py-10">{c.error}</p>
              ) : selPhotos.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-white/70">{c.noSelections}</p>
                  <p className="text-xs text-white/40 mt-1">{c.noSelectionsHint}</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-white/50 mb-3">
                    <span className="text-[#2dabe0] font-semibold">{selPhotos.length}</span> {c.photosSelected}
                  </p>
                  <ul className="space-y-1">
                    {selPhotos.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 text-sm text-white/80 bg-white/[0.03] rounded-lg px-3 py-2">
                        <svg className="w-3.5 h-3.5 text-[#2dabe0] shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
                        <span className="truncate">{p.name}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {!selLoading && !selError && selPhotos.length > 0 && (
              <div className="p-4 border-t border-white/[0.08] flex gap-2">
                <button
                  onClick={copySelectionList}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition-all border ${
                    selCopied ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "border-white/10 text-white/80 hover:bg-white/[0.06]"
                  }`}
                >
                  {selCopied ? (
                    <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>{c.copied}</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>{c.copyList}</>
                  )}
                </button>
                <button
                  onClick={downloadSelectionFiles}
                  disabled={selZipping}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold bg-white text-stone-900 hover:bg-stone-100 transition-all disabled:opacity-60"
                >
                  {selZipping ? (
                    <><div className="w-4 h-4 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" />{c.preparing}</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>{c.downloadFiles}</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-scale-in">
            <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="font-semibold text-white text-center mb-1.5">{c.deleteTitle}</h3>
            <p className="text-sm text-white/70 text-center mb-6 leading-relaxed">
              {c.deleteBody1}{" "}
              <span className="font-medium text-stone-200">&ldquo;{gallery.name}&rdquo;</span>{" "}
              {c.deleteBody2}
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 border border-white/10 text-stone-300 rounded-xl py-2.5 text-sm font-medium hover:bg-white/[0.06] transition-colors disabled:opacity-50"
              >
                {c.cancel}
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : c.delete
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
