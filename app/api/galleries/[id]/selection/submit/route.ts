import { NextRequest, NextResponse } from "next/server";
import { availabilityOf, isUnavailable } from "@/lib/server/gallery-availability";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { verifyGalleryToken } from "@/lib/gallery/session";
import { isPrivate } from "@/lib/gallery/visibility";
import { sendEmail, escapeHtml } from "@/lib/email";
import { APP_URL } from "@/lib/branding";
import { clientIp, getRateLimiter, rateLimitHeaders } from "@/lib/server/rate-limit";
import { parseJson } from "@/lib/server/http";
import { SelectionSubmitBody } from "@/lib/shared/schemas/public";
import { galleriesCol, gallerySelectionsCol, usersCol } from "@/lib/server/repos/collections";

export const runtime = "nodejs";

/**
 * A client tells the photographer "this is my selection".
 *
 * Favorites are already shared live (see ../route.ts); this adds an explicit
 * hand-off: the client leaves their name (and optionally email + note), the
 * submission is stored next to the selection, and the photographer gets an
 * email. Public endpoint — password-protected galleries require the visitor's
 * gallery cookie, and it is rate-limited per IP + gallery.
 */

// At most 5 submissions per 10 minutes per visitor and gallery, counted in the shared store (S3-06).
const MAX_PER_WINDOW = 5;
const WINDOW_SEC = 10 * 60;

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const limit = await getRateLimiter().limit({ name: "selection-submit", id: `${clientIp(req)}|${id}`, limit: MAX_PER_WINDOW, windowSec: WINDOW_SEC });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a few minutes." },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const parsedBody = await parseJson(req, SelectionSubmitBody);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  // Honeypot — bots fill this hidden field, humans don't.
  if (String(body.website ?? "").trim() !== "") return NextResponse.json({ ok: true });

  const name = String(body.name ?? "").trim().slice(0, 100);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  const note = String(body.note ?? "").trim().slice(0, 1000);
  if (name.length < 2) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (email && !isValidEmail(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });

  const db = getAdminDb();
  const galSnap = await galleriesCol(db).doc(id).get();
  if (!galSnap.exists || isUnavailable(await availabilityOf(galSnap.data()!))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gallery = galSnap.data()!;

  // Password-protected galleries: the visitor must have unlocked this gallery.
  if (isPrivate(gallery)) {
    const token = req.cookies.get(`gallery_token_${id}`)?.value;
    const valid = token ? await verifyGalleryToken(token) : null;
    if (!valid || valid.galleryId !== id || valid.v !== (gallery.pwChangedAt ?? 0)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const selRef = gallerySelectionsCol(db).doc(id);
  const selSnap = await selRef.get();
  const items: { id: string; name: string }[] = selSnap.exists ? (selSnap.data()?.items ?? []) : [];
  if (items.length === 0) return NextResponse.json({ error: "No photos selected." }, { status: 400 });
  items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const submittedAt = Date.now();
  await selRef.set(
    { galleryId: id, submission: { name, email: email || null, note: note || null, count: items.length, submittedAt } },
    { merge: true }
  );

  // "Switch off downloads once a selection is sent" (S9-06): stamp the gallery so every download route refuses from now on.
  const downloadsLocked = gallery.disableDownloadAfterSubmit === true;
  if (downloadsLocked) await galSnap.ref.update({ downloadsLockedAt: submittedAt });

  // Notify the photographer (best-effort — the submission is already saved).
  let emailed = false;
  try {
    let to = "";
    const userSnap = await usersCol(db).doc(String(gallery.photographerId)).get();
    to = typeof userSnap.data()?.email === "string" ? userSnap.data()!.email : "";
    if (!to) to = (await getAdminAuth().getUser(String(gallery.photographerId))).email ?? "";
    if (to) {
      const galleryName = String(gallery.name ?? "Gallery");
      const list = items.slice(0, 200);
      const more = items.length - list.length;
      const subject = `${name} sent a selection of ${items.length} photo${items.length === 1 ? "" : "s"} — ${galleryName}`;
      const text =
        `${name}${email ? ` <${email}>` : ""} sent their selection for "${galleryName}" (${items.length} photos).\n` +
        (note ? `\nNote: ${note}\n` : "") +
        `\n${list.map((i) => i.name).join("\n")}${more > 0 ? `\n…and ${more} more` : ""}\n\n` +
        `Open your dashboard: ${APP_URL}/dashboard`;
      const html =
        `<p><strong>${escapeHtml(name)}</strong>${email ? ` &lt;${escapeHtml(email)}&gt;` : ""} sent their selection for ` +
        `<strong>${escapeHtml(galleryName)}</strong> (${items.length} photo${items.length === 1 ? "" : "s"}).</p>` +
        (note ? `<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #ccc">${escapeHtml(note).replace(/\n/g, "<br/>")}</blockquote>` : "") +
        `<ul>${list.map((i) => `<li>${escapeHtml(i.name)}</li>`).join("")}</ul>` +
        (more > 0 ? `<p>…and ${more} more</p>` : "") +
        `<p><a href="${APP_URL}/dashboard">Open your dashboard</a> to download the selection.</p>`;
      emailed = await sendEmail({ to, subject, html, text, replyTo: email || undefined });
    }
  } catch (err) {
    console.error("selection submit: notify failed", err);
  }

  return NextResponse.json({ ok: true, emailed, downloadsLocked });
}
