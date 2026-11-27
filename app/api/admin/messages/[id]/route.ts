import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { contactMessagesCol } from "@/lib/server/repos/collections";

/** PATCH: mark a message read/unread. DELETE: remove a message. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const uid = admin.user.uid;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  await contactMessagesCol().doc(id).set(
    { read: body.read === true, readAt: Date.now() },
    { merge: true }
  );
  await writeAudit({ actorUid: uid, action: body.read === true ? "message.mark_read" : "message.mark_unread", targetType: "message", targetId: id });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;
  const uid = admin.user.uid;

  const { id } = await params;
  await contactMessagesCol().doc(id).delete();
  // The message itself (a visitor's name and e-mail) is deliberately not copied into the audit log.
  await writeAudit({ actorUid: uid, action: "message.delete", targetType: "message", targetId: id });
  return NextResponse.json({ ok: true });
}
