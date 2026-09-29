import type { MetadataRoute } from "next";
import { APP_URL } from "@/lib/branding";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = APP_URL.replace(/\/$/, "");
  const paths = ["", "/subscribe", "/faq", "/contact", "/terms", "/privacy", "/login", "/lp/pixieset-alternative"];
  return paths.map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "monthly" as const,
    priority: p === "" ? 1 : p.startsWith("/lp/") ? 0.8 : 0.6,
  }));
}
