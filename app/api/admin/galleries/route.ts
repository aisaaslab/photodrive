import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/server/auth";
import { galleriesCol, usersCol } from "@/lib/server/repos/collections";
import { newestFirst, ownerGalleryOf } from "@/lib/server/repos/galleries";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const snap = await galleriesCol().get();
  // Passwords are stored sealed; decrypt for the admin view.
  const galleries = snap.docs.map(ownerGalleryOf).sort(newestFirst);

  // Fetch user info for all unique photographer IDs. Firestore `name` wins
  // over Auth displayName — it's what the user can edit in Account settings.
  const photographerIds = [...new Set(galleries.map((g) => g.photographerId).filter(Boolean))] as string[];
  const userMap: Record<string, { email: string; displayName: string; photoURL?: string }> = {};
  await Promise.all(
    photographerIds.map(async (pid) => {
      try {
        const [user, userDoc] = await Promise.all([
          getAdminAuth().getUser(pid),
          usersCol().doc(pid).get(),
        ]);
        const fsName = typeof userDoc.data()?.name === "string" ? userDoc.data()?.name : "";
        userMap[pid] = {
          email: user.email ?? "",
          displayName: fsName || user.displayName || "",
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
