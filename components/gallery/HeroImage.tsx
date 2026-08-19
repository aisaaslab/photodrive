"use client";

import { useState } from "react";
import { driveFileThumbUrl } from "@/lib/drive/public-url";

/**
 * Hero/cover image for the public gallery page.
 *
 * The gallery page is a server component, so it can't attach onError handlers
 * — this client island owns the fallback chain instead. Google's lh3 CDN URL
 * (from thumbnailLink) can be rate-limited or stale; the dashboard card works
 * because it uses the drive.google.com/thumbnail format. So we try, in order:
 *
 *  1. The thumbnailLink-based CDN URL computed on the server (fast when alive)
 *  2. drive.google.com/thumbnail?id=... (the format proven to work reliably)
 *  3. /api/photos/proxy (our server proxy, authenticated with the API key)
 *  4. Give up → render the branded gradient so we never show a broken image
 */
interface Props {
  primaryUrl: string;
  fileId: string;
  alt?: string;
}

export function HeroImage({ primaryUrl, fileId, alt = "" }: Props) {
  // 0 = primary CDN url, 1 = drive thumbnail, 2 = our proxy, 3 = failed
  const [stage, setStage] = useState(0);

  if (stage >= 3) {
    // All URLs failed — branded gradient, never a broken-image icon.
    return <div className="absolute inset-0 bg-gradient-to-br from-[#17509e] via-[#0d2d5c] to-stone-900" />;
  }

  const src =
    stage === 0
      ? primaryUrl
      : stage === 1
        ? driveFileThumbUrl(fileId, 2048)
        : `/api/photos/proxy?fileId=${fileId}&size=preview`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={stage}
      src={src}
      alt={alt}
      className="absolute inset-0 w-full h-full object-cover"
      fetchPriority="high"
      onError={() => setStage((s) => s + 1)}
    />
  );
}
