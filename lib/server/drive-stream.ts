import { NextResponse } from "next/server";

export type DriveSize = "thumb" | "preview" | "full" | "stream";

/** What a caller decides about caching: private galleries must never sit in a shared cache. */
export type StreamOptions = { fileId: string; size: DriveSize; apiKey: string; range: string | null; sharedCache: boolean; /** Shared-cache lifetime for thumbnails/previews. Defaults to a day (the proxy); signed URLs use less. */ publicMaxAgeSec?: number };

const error = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/**
 * Fetches a file's bytes from Google Drive and returns them as a response. The caller has already decided the visitor may have
 * them: this function only knows how to get them.
 *   thumb   — small grid thumbnail (~800px)
 *   preview — compressed full-screen view (~2048px)
 *   full    — original file; streamed, and the Range header is forwarded so a <video> can seek
 *   stream  — the same bytes as full, for playing in the page
 * Originals are always `private` for caches (whether they may be served depends on who asks and on the gallery's settings).
 */
export async function streamFromDrive({ fileId, size, apiKey, range, sharedCache, publicMaxAgeSec }: StreamOptions): Promise<NextResponse> {
  let url: string;
  if (size === "full" || size === "stream") url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  else if (size === "preview") url = `https://drive.google.com/thumbnail?id=${fileId}&sz=w2048`;
  else url = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;

  try {
    const upstream = await fetch(url, range && (size === "full" || size === "stream") ? { headers: { Range: range } } : undefined);
    if (!upstream.ok) return error(502, "Could not fetch image");

    if (size === "full" || size === "stream") {
      // Stream the body (no full buffer in memory) and pass through the range metadata so seeking works.
      const headers = new Headers({ "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" });
      for (const h of ["content-type", "content-length", "content-range"] as const) {
        const v = upstream.headers.get(h);
        if (v) headers.set(h, v);
      }
      return new NextResponse(upstream.body, { status: upstream.status, headers });
    }

    // thumb / preview: small images, buffered.
    return new NextResponse(await upstream.arrayBuffer(), {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": !sharedCache
          ? "private, max-age=3600"
          : publicMaxAgeSec
            ? `public, max-age=${publicMaxAgeSec}`
            : "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return error(500, "Proxy error");
  }
}
