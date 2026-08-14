import { ImageResponse } from "next/og";
import { APP_NAME, APP_DOMAIN, APP_TAGLINE, APP_DESCRIPTION } from "@/lib/branding";

export const alt = `${APP_NAME}, ${APP_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The tagline renders as two lines in two colours. Split on the last sentence
// break so "Share your work. Beautifully." keeps its original look; a tagline
// with no second sentence simply renders as one line.
const m = APP_TAGLINE.trim().match(/^(.*[.!?])\s+(\S.*)$/);
const taglineLine1 = m ? m[1] : APP_TAGLINE;
const taglineLine2 = m ? m[2] : "";

// Social link-preview image (auto-generated). Clean white + deep teal brand.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 40 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9999, background: "#2D6A6A" }} />
          <div style={{ fontSize: 46, fontWeight: 700, color: "#1f2937", letterSpacing: "-0.02em" }}>
            {APP_NAME}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 700, color: "#262626", letterSpacing: "-0.03em" }}>
          {taglineLine1}
        </div>
        {taglineLine2 ? (
          <div style={{ display: "flex", fontSize: 84, fontWeight: 700, color: "#2D6A6A", letterSpacing: "-0.03em" }}>
            {taglineLine2}
          </div>
        ) : null}
        <div style={{ display: "flex", marginTop: 44, fontSize: 26, color: "#6b7280" }}>
          {APP_DESCRIPTION} · {APP_DOMAIN}
        </div>
      </div>
    ),
    { ...size }
  );
}
