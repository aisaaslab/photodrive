/**
 * One-off, repeatable: re-encode the landing page photos exported from Figma (design-assets/landing-src/*.jpg) as WebP into public/landing
 * (the site serves images unoptimised on purpose, so what is in /public is what visitors download). Usage: node scripts/build-landing-images.mjs
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const dir = "design-assets/landing-src";
const outDir = "public/landing";
for (const f of readdirSync(dir).filter((n) => n.endsWith(".jpg"))) {
  const input = join(dir, f);
  const out = join(outDir, f.replace(/\.jpg$/, ".webp"));
  const info = await sharp(input).webp({ quality: f === "hero.jpg" ? 72 : 78, effort: 6 }).toFile(out);
  console.log(f, "->", out.split("/").pop(), `${(info.size / 1024).toFixed(0)} KB`);
}
