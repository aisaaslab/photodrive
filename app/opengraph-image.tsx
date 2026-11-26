import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { APP_NAME, APP_DOMAIN, APP_DESCRIPTION } from "@/lib/branding";
import { en } from "@/lib/i18n/dictionaries/en";

export const alt = `${APP_NAME}, ${APP_DESCRIPTION}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Social link-preview image in the Cinematic Dark style of the landing page (S6-12): the original logo, the headline in two lines
// (the second in the accent colour), and the descriptor with the domain.
export default async function OpengraphImage() {
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public", "logo-light.png"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "0 90px", background: "#06080c", fontFamily: "sans-serif",
          backgroundImage: "radial-gradient(ellipse 80% 60% at 85% 0%, rgba(45,171,224,0.28), rgba(6,8,12,0) 70%)",
        }}
      >
        <img src={logo} alt="" width={330} height={90} style={{ marginBottom: 56 }} />
        <div style={{ display: "flex", fontSize: 66, fontWeight: 800, color: "#f5f7fa", letterSpacing: "-0.03em", lineHeight: 1.05 }}>{en.hero.title1}</div>
        <div style={{ display: "flex", fontSize: 66, fontWeight: 800, color: "#2dabe0", letterSpacing: "-0.03em", lineHeight: 1.05 }}>{en.hero.title2}</div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 28, color: "#9aa6b6" }}>{APP_DESCRIPTION} · {APP_DOMAIN}</div>
      </div>
    ),
    { ...size }
  );
}
