import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";
import type { GalleryDoc } from "@/lib/firestore/types";

export async function GET(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const snap = await getAdminDb().collection("galleries").get();
  // Cast on the map result, not on the whole chain: .sort() runs on the
  // intermediate array, which TypeScript infers as { id: string } alone.
  const galleries = (snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  })) as GalleryDoc[]).sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));

  // Fetch user info for all unique photographer IDs
  const photographerIds = [...new Set(galleries.map((g) => g.photographerId).filter(Boolean))] as string[];
  const userMap: Record<string, { email: string; displayName: string; photoURL?: string }> = {};
  await Promise.all(
    photographerIds.map(async (pid) => {
      try {
        const user = await getAdminAuth().getUser(pid);
        userMap[pid] = {
          email: user.email ?? "",
          displayName: user.displayName ?? "",
          photoURL: user.photoURL,
        };
      } catch {}
    })
  );

  const enriched = galleries.map((g) => ({
    ...g,
    photographer: userMap[g.photographerId] ?? null,
  }));

  return NextResponse.json({ galleries: enriched });
}
