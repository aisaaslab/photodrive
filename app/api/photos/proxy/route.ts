import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies Drive image bytes so the client never sees Google Drive URLs.
 * ?fileId=xxx&size=thumb|preview|full
 *   thumb   — small grid thumbnail (~800px)
 *   preview — compressed full-screen view (~2048px)
 *   full    — original, uncompressed file (downloads only)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const fileId = searchParams.get("fileId");
  const size = searchParams.get("size") ?? "thumb";

  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return NextResponse.json({ error: "Missing or invalid fileId" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // full: original bytes (downloads). preview: compressed ~2048px for the
  // full-screen view. thumb: small ~800px grid thumbnail.
  let url: string;
  if (size === "full") {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  } else if (size === "preview") {
    url = `https://drive.google.com/thumbnail?id=${fileId}&sz=w2048`;
  } else {
    url = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
  }

  try {
    // For originals (videos/downloads) forward the browser's Range header so
    // upstream can answer with a partial 206 — this is what lets the <video>
    // player seek/scrub instead of only playing from the start.
    const range = req.headers.get("range");
    const upstream = await fetch(url, range ? { headers: { Range: range } } : undefined);

    if (!upstream.ok) {
      return NextResponse.json({ error: "Could not fetch image" }, { status: 502 });
    }

    if (size === "full") {
      // Stream the body (no full buffer in memory) and pass through the range
      // metadata so seeking works. Downloads send no Range → normal 200 stream.
      const headers = new Headers({ "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400" });
      for (const h of ["content-type", "content-length", "content-range"] as const) {
        const v = upstream.headers.get(h);
        if (v) headers.set(h, v);
      }
      return new NextResponse(upstream.body, { status: upstream.status, headers });
    }

    // thumb / preview: small images — buffer + cache aggressively.
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.json({ error: "Proxy error" }, { status: 500 });
  }
}
