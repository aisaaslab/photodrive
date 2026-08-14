import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { isAdmin } from "@/lib/firebase/admin-guard";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);

    // Admin always has access
    if (isAdmin(decoded.uid)) {
      return NextResponse.json({ isActive: true, status: "admin", expiresAt: null });
    }

    const snap = await getAdminDb().collection("users").doc(decoded.uid).get();
    const data = snap.data();

    const status = data?.subscriptionStatus ?? "none";
    const expiresAt: number = data?.subscriptionExpiresAt ?? 0;
    const isActive = status === "active" && expiresAt > Date.now();

    return NextResponse.json({ isActive, status, expiresAt });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
