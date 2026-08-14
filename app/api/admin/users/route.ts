import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { getUidFromRequest, isAdmin } from "@/lib/firebase/admin-guard";
import type { GalleryDoc } from "@/lib/firestore/types";

export async function GET(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!isAdmin(uid)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [listUsersResult, galleriesSnap] = await Promise.all([
    getAdminAuth().listUsers(1000),
    getAdminDb().collection("galleries").get(),
  ]);

  // Firestore returns untyped documents, so the shape is asserted rather than
  // inferred — spreading Record<string, unknown> yields just { id } to tsc.
  const galleries = galleriesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  })) as unknown as GalleryDoc[];

  // Count galleries per photographer
  const galleryCounts: Record<string, number> = {};
  const latestGallery: Record<string, number> = {};
  for (const g of galleries) {
    const pid = g.photographerId;
    if (!pid) continue;
    galleryCounts[pid] = (galleryCounts[pid] ?? 0) + 1;
    if ((g.createdAt ?? 0) > (latestGallery[pid] ?? 0)) {
      latestGallery[pid] = g.createdAt;
    }
  }

  // Fetch subscription data from Firestore for all users
  const userDocs = await getAdminDb().collection("users").get();
  const subMap: Record<string, { status: string; expiresAt: number; comp: boolean }> = {};
  for (const doc of userDocs.docs) {
    const d = doc.data();
    subMap[doc.id] = {
      status: d.subscriptionStatus ?? "none",
      expiresAt: d.subscriptionExpiresAt ?? 0,
      comp: d.compGranted === true,
    };
  }

  const now = Date.now();
  const users = listUsersResult.users.map((u) => {
    const sub = subMap[u.uid];
    const isActive = sub?.status === "active" && sub?.expiresAt > now;
    return {
      uid: u.uid,
      email: u.email ?? "",
      displayName: u.displayName ?? "",
      photoURL: u.photoURL ?? null,
      createdAt: u.metadata.creationTime,
      lastSignIn: u.metadata.lastSignInTime,
      galleryCount: galleryCounts[u.uid] ?? 0,
      lastGalleryAt: latestGallery[u.uid] ?? null,
      subscriptionActive: isActive,
      subscriptionExpiresAt: sub?.expiresAt ?? null,
      compGranted: sub?.comp ?? false,
    };
  });

  // Sort by gallery count desc
  users.sort((a, b) => b.galleryCount - a.galleryCount);

  return NextResponse.json({ users });
}
