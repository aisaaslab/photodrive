"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n";

/**
 * The "paste a Drive link, get a 10-minute demo" flow shared by the landing forms: posts the link, then opens the demo gallery.
 * Errors are the translated messages for a rate limit (429), a bad link, or anything else.
 */
export function useDemoCreate() {
  const { t } = useLanguage();
  const d = t.demo;
  const router = useRouter();
  const [driveUrl, setDriveUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/demo/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveUrl }),
      });
      if (res.status === 429) { setError(d.rateLimitError); return; }
      if (!res.ok) {
        const data = await res.json();
        setError(data.error === "Invalid Google Drive folder URL" ? d.invalidUrl : d.genericError);
        return;
      }
      const { id } = await res.json();
      router.push(`/demo/${id}`);
    } catch {
      setError(d.genericError);
    } finally {
      setLoading(false);
    }
  }

  return { driveUrl, setDriveUrl, loading, error, submit };
}
