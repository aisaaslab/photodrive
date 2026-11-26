import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("app/globals.css", "utf8");
const token = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1].trim().toLowerCase();

describe("design tokens match the approved design (S5-02)", () => {
  const palette: Record<string, string> = {
    "color-canvas": "#06080c", "color-surface": "#0d1219", "color-surface-2": "#141b26", "color-line": "#222c3a",
    "color-fg": "#f5f7fa", "color-fg-soft": "#bdc4d1", "color-fg-muted": "#9aa6b6", "color-accent": "#2dabe0",
    "color-accent-deep": "#17509e", "color-accent-soft": "#0e2a3c", "color-accent-hi": "#5b8cff",
  };
  for (const [name, hex] of Object.entries(palette)) it(`--${name} is ${hex}`, () => expect(token(name)).toMatch(new RegExp(`^${hex}`)));

  it("keeps the brand colours the app already used", () => {
    expect(token("color-accent")).toMatch(/^#2dabe0/);
    expect(token("color-accent-deep")).toMatch(/^#17509e/);
  });
  it("has the display font, with Plex Sans as the fallback", () => expect(token("font-display")).toMatch(/manrope variable.*ibm plex sans/));
  it("no longer names anything after a colour that is not used (rose)", () => expect(css).not.toMatch(/rose/i));
  it("declares the Manrope font files", () => {
    const fonts = readFileSync("app/fonts.css", "utf8");
    for (const script of ["greek", "latin", "latin-ext"]) expect(fonts).toContain(`manrope-${script}-wght-normal.woff2`);
  });
});
