import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

const COLLECTION = "gallery_selections";

type Item = { id: string; name: string };

/**
 * Shared favourites for a gallery. There is ONE selection per gallery, so
 * anyone who opens the gallery link sees the same favourited photos, and the
 * photographer sees them too. No account needed.
 */

// Public: return the gallery's shared favourites.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const snap = await getAdminDb().collection(COLLECTION).doc(id).get();
  const items: Item[] = snap.exists ? (snap.data()?.items ?? []) : [];
  items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return NextResponse.json({ photos: items });
}

// Public: add or remove one photo from the shared favourites.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { action?: string; item?: Item };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { action, item } = body;
  if (!item || typeof item.id !== "string" || (action !== "add" && action !== "remove")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const db = getAdminDb();
  const galSnap = await db.collection("galleries").doc(id).get();
  if (!galSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  let items: Item[] = snap.exists ? (snap.data()?.items ?? []) : [];

  if (action === "add") {
    if (!items.some((i) => i.id === item.id)) {
      items.push({ id: item.id, name: String(item.name ?? "").slice(0, 300) });
    }
  } else {
    items = items.filter((i) => i.id !== item.id);
  }

  await ref.set({ galleryId: id, items, count: items.length, updatedAt: Date.now() });
  return NextResponse.json({ ok: true, count: items.length });
}
