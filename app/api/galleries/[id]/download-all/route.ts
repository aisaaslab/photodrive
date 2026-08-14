import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getAdminDb } from "@/lib/firebase/admin";
import { fetchDriveFolder } from "@/lib/drive/client";
import { verifyGalleryToken } from "@/lib/gallery/session";
import { makeZip } from "client-zip";

// Node runtime + long timeout: we stream a (possibly large) zip built from
// many Drive files. The zip is produced lazily with backpressure, so only one
// file is in flight at a time and nothing is buffered fully in memory.
export const runtime = "nodejs";
export const maxDuration = 300;

// Very large galleries are split into parts so a single download never runs
// long enough to hit the platform time limit. Must match PART_SIZE on the
// client (MasonryGrid) so the part count agrees.
const PART_SIZE = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const snap = await getAdminDb().collection("galleries").doc(id).get();
  if (!snap.exists) return new Response("Not found", { status: 404 });
  const gallery = snap.data()!;

  // Respect the per-gallery download switch.
  if (gallery.allowDownload === false) {
    return new Response("Downloads are disabled for this gallery", { status: 403 });
  }

  // Password-protected gallery: require the same access cookie as the page.
  if (gallery.passwordHash) {
    const token = (await cookies()).get(`gallery_token_${id}`)?.value;
    const valid = token ? await verifyGalleryToken(token) : null;
    if (!valid || valid.galleryId !== id || valid.v !== (gallery.pwChangedAt ?? 0)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) return new Response("Server misconfigured", { status: 500 });

  const { files } = await fetchDriveFolder(gallery.folderId);
  if (files.length === 0) return new Response("No photos", { status: 404 });

  // If a ?part=N is asked for (and the gallery is big enough to be split),
  // serve only that slice; otherwise serve everything as one zip.
  const totalParts = Math.max(1, Math.ceil(files.length / PART_SIZE));
  const partParam = Number(req.nextUrl.searchParams.get("part"));
  const part = Number.isInteger(partParam) && partParam >= 1 && partParam <= totalParts ? partParam : 0;
  const selected = part && totalParts > 1 ? files.slice((part - 1) * PART_SIZE, part * PART_SIZE) : files;

  // Yield one file at a time; client-zip pulls the next only when the previous
  // has been written out to the client, keeping memory flat even for 1000+.
  async function* entries() {
    for (const f of selected) {
      try {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`
        );
        if (res.ok && res.body) {
          yield { name: f.name, input: res };
        }
      } catch {
        // skip a file that fails, keep going
      }
    }
  }

  const baseName = (gallery.name || "gallery").replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "gallery";
  const fileName = part && totalParts > 1 ? `${baseName} - Part ${part}.zip` : `${baseName}.zip`;

  return new Response(makeZip(entries()), {
    headers: {
      "Content-Type": "application/zip",
      // RFC 5987 filename* carries the Greek/Unicode name; plain filename is an ASCII fallback.
      "Content-Disposition": `attachment; filename="download.zip"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
