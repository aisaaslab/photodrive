"use client";

import { useEffect } from "react";

/**
 * Tells the server a visitor opened this gallery (S10-02). Renders nothing. The server decides whether it counts (once per browser
 * session, only for galleries the visitor may see), so a reload or a second tab does not inflate the number.
 */
export function ViewBeacon({ galleryId }: { galleryId: string }) {
  useEffect(() => {
    fetch(`/api/galleries/${encodeURIComponent(galleryId)}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [galleryId]);
  return null;
}
