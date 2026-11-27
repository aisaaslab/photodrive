"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/auth/AuthProvider";
import type { AdminUserDetail } from "@/lib/server/repos/admin-users";

type G = AdminUserDetail["galleries"][number];

const field = "w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent/60";

/** Edit one of a user's galleries from the back office (name, visibility and password, Drive folder, social links). Writes through PATCH /api/admin/galleries/[id], which audits it. */
export function GalleryEditForm({ gallery, onSaved, onCancel }: { gallery: G; onSaved: (g: Partial<G>) => void; onCancel: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(gallery.name);
  const [visibility, setVisibility] = useState<"public" | "private">(gallery.visibility);
  const [password, setPassword] = useState("");
  const [drive, setDrive] = useState(gallery.folderId ? `https://drive.google.com/drive/folders/${gallery.folderId}` : "");
  const [social, setSocial] = useState({ website: gallery.website ?? "", instagram: gallery.instagram ?? "", facebook: gallery.facebook ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!user) return;
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = { name, visibility, website: social.website.trim(), instagram: social.instagram.trim(), facebook: social.facebook.trim() };
      if (drive && drive !== `https://drive.google.com/drive/folders/${gallery.folderId}`) body.driveUrl = drive;
      if (visibility === "private" && password) body.password = password;
      const res = await fetch(`/api/admin/galleries/${gallery.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Could not save"); return; }
      onSaved({ name: data.name ?? name, visibility: data.visibility ?? visibility, hasPassword: visibility === "private", website: data.website ?? null, instagram: data.instagram ?? null, facebook: data.facebook ?? null, folderId: data.folderId ?? gallery.folderId });
    } catch { setError("Could not save"); } finally { setSaving(false); }
  };

  const id = (k: string) => `ge-${gallery.id}-${k}`;
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-3 rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label htmlFor={id("name")} className="block text-xs text-fg-muted mb-1">Name</label><input id={id("name")} value={name} onChange={(e) => setName(e.target.value)} className={field} /></div>
        <div>
          <label htmlFor={id("vis")} className="block text-xs text-fg-muted mb-1">Visibility</label>
          <select id={id("vis")} value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "private")} className={field}>
            <option value="public">Public (no password)</option><option value="private">Private (password required)</option>
          </select>
        </div>
      </div>
      {visibility === "private" && (
        <div>
          <label htmlFor={id("pw")} className="block text-xs text-fg-muted mb-1">{gallery.hasPassword ? "New password" : "Password"}</label>
          <input id={id("pw")} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={200} autoComplete="off" placeholder={gallery.hasPassword ? "Leave empty to keep the current password" : "Required for a private gallery"} className={field} />
        </div>
      )}
      {visibility === "public" && gallery.hasPassword && <p className="text-xs text-amber-300">Saving as public removes this gallery&apos;s password.</p>}
      <div><label htmlFor={id("drive")} className="block text-xs text-fg-muted mb-1">Google Drive folder URL</label><input id={id("drive")} value={drive} onChange={(e) => setDrive(e.target.value)} className={`${field} font-mono text-xs`} /></div>
      <div className="grid sm:grid-cols-3 gap-3">
        {(["website", "instagram", "facebook"] as const).map((k) => (
          <div key={k}><label htmlFor={id(k)} className="block text-xs text-fg-muted mb-1 capitalize">{k}</label><input id={id(k)} value={social[k]} onChange={(e) => setSocial((s) => ({ ...s, [k]: e.target.value }))} placeholder="https://…" className={field} /></div>
        ))}
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2"><Button size="sm" type="submit" loading={saving}>Save</Button><Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}
