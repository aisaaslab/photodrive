import type { MetadataRoute } from "next";
import { APP_URL } from "@/lib/branding";

export default function robots(): MetadataRoute.Robots {
  const base = APP_URL.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private / non-marketing surfaces — keep out of the index.
      disallow: ["/dashboard", "/api", "/demo", "/gallery"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
