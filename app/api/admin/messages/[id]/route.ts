import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { parseJson, route } from "@/lib/server/http";
import { getMessage } from "@/lib/server/repos/admin-messages";
import { contactMessagesCol } from "@/lib/server/repos/collections";

const Body = z.object({
  read: z.boolean().optional(),
  status: z.enum(["open", "resolved"]).optional(),
  note: z.string().max(1000).optional(),
}).refine((b) => b.read !== undefined || b.status !== undefined || b.note !== undefined, { message: "Nothing to change" });

/**
 * Admin-only: change one contact message (S8-02). Body: any of `read` (mark read or unread), `status` ("resolved" or back to "open") and
 * `note` (an internal note for the team, never shown to the sender; an empty note clears it). Resolving also marks the message read, and a
 * resolved message cannot be marked unread without reopening it, so "resolved implies read" always holds. Each real change leaves its own
 * audit entry; asking for what is already true changes nothing. The sender's message itself is never copied into the audit log.
 */
export const PATCH = route("admin.messages.patch", async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const actor = admin.user.uid;
  const { id } = await params;

  const parsed = await parseJson(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const ref = contactMessagesCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Message not found" }, { status: 404 });
  const cur = snap.data()!;
  const now = Date.now();

  const updates: Record<string, unknown> = {};
  const audits: { action: string; note?: string }[] = [];
  let resolved = cur.status === "resolved";
  let read = cur.read === true;

  if (body.status === "resolved" && !resolved) {
    updates.status = "resolved"; updates.resolvedAt = now; updates.resolvedBy = actor;
    if (!read) { updates.read = true; updates.readAt = now; read = true; }
    resolved = true;
    audits.push({ action: "message.resolve", ...(body.note?.trim() && { note: body.note.trim().slice(0, 300) }) });
  } else if (body.status === "open" && resolved) {
    updates.status = "open"; updates.resolvedAt = FieldValue.delete(); updates.resolvedBy = FieldValue.delete();
    resolved = false;
    audits.push({ action: "message.reopen" });
  }

  if (body.read !== undefined && body.read !== read) {
    if (body.read === false && resolved) return NextResponse.json({ error: "A resolved message is always read. Reopen it first." }, { status: 409 });
    updates.read = body.read; updates.readAt = now;
    audits.push({ action: body.read ? "message.mark_read" : "message.mark_unread" });
  }

  if (body.note !== undefined) {
    const note = body.note.trim();
    if (!note && cur.note) {
      updates.note = FieldValue.delete(); updates.noteAt = FieldValue.delete(); updates.noteBy = FieldValue.delete();
      audits.push({ action: "message.note_cleared" });
    } else if (note && note !== cur.note) {
      updates.note = note; updates.noteAt = now; updates.noteBy = actor;
      audits.push({ action: "message.note", note: note.slice(0, 300) });
    }
  }

  if (Object.keys(updates).length > 0) {
    await ref.update(updates);
    for (const a of audits) await writeAudit({ actorUid: actor, action: a.action, targetType: "message", targetId: id, ...(a.note && { note: a.note }) });
  }
  return NextResponse.json({ ok: true, message: await getMessage(id) });
});

export const DELETE = route("admin.messages.delete", async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const { id } = await params;

  const ref = contactMessagesCol().doc(id);
  if (!(await ref.get()).exists) return NextResponse.json({ error: "Message not found" }, { status: 404 });
  await ref.delete();
  // The message itself (a visitor's name and e-mail) is deliberately not copied into the audit log.
  await writeAudit({ actorUid: admin.user.uid, action: "message.delete", targetType: "message", targetId: id });
  return NextResponse.json({ ok: true });
});
