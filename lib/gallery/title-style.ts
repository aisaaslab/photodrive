/**
 * Title styling options for the public gallery page.
 *
 * Photographers pick a font and a color for the gallery title from a curated
 * set — no free-form input, nothing a non-techy user can get wrong.
 *
 * Performance: the extra fonts are loaded via next/font in app/layout.tsx,
 * which self-hosts them at build time. next/font emits a @font-face rule per
 * family, but the browser only downloads a woff2 file when text actually uses
 * that family — so pages that don't use a font never pay for it, and pages
 * that do get zero-layout-shift, CDN-free loading.
 *
 * Note: the curated fonts ship latin glyphs only. Titles written in other
 * scripts (e.g. Greek) gracefully fall back to the inherited site font.
 */

export const TITLE_FONT_IDS = ["classic", "serif", "script", "modern", "mono"] as const;
export type TitleFontId = (typeof TITLE_FONT_IDS)[number];

/** CSS font-family for a title font id. "classic" = the site's brand font. */
export function titleFontFamily(id?: string | null): string {
  switch (id) {
    case "serif":
      return "var(--font-title-serif), Georgia, serif";
    case "script":
      return "var(--font-title-script), cursive";
    case "modern":
      return "var(--font-title-modern), sans-serif";
    case "mono":
      return "var(--font-title-mono), monospace";
    default:
      return "var(--font-brand), sans-serif";
  }
}

/** Returns the id only if it's a known font id, else null (for API validation). */
export function validTitleFont(id: unknown): TitleFontId | null {
  return typeof id === "string" && (TITLE_FONT_IDS as readonly string[]).includes(id)
    ? (id as TitleFontId)
    : null;
}

/**
 * Curated light swatches — all readable over the dark hero gradient, so any
 * pick is a safe pick. Displayed as round color chips; no names needed.
 */
export const TITLE_COLORS = [
  "#ffffff", // white
  "#f8f0dc", // ivory
  "#dfc17c", // gold
  "#f2c4c4", // blush
  "#b5d3f0", // sky
  "#bfe5cf", // mint
  "#d7c5f0", // lilac
  "#f0d9b5", // sand
  "#ffd9b3", // peach
  "#f5e8a8", // lemon
  "#a8e0dd", // aqua
  "#c5c8f0", // periwinkle
  "#f8a488", // salmon
  "#d4d4d4", // silver
] as const;

/** Returns the hex only if it's a 6-digit hex color, else null. */
export function validTitleColor(color: unknown): string | null {
  return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
}

export const TITLE_SIZE_IDS = ["sm", "md", "lg", "xl"] as const;
export type TitleSizeId = (typeof TITLE_SIZE_IDS)[number];

/**
 * Responsive text-size classes for a title size id. "md" is the default that
 * matches the pre-picker look, so unset size = unchanged appearance.
 */
export function titleSizeClass(id?: string | null): string {
  switch (id) {
    case "sm":
      return "text-xl sm:text-2xl lg:text-3xl";
    case "lg":
      return "text-3xl sm:text-4xl lg:text-5xl";
    case "xl":
      return "text-4xl sm:text-5xl lg:text-6xl";
    default:
      return "text-2xl sm:text-3xl lg:text-4xl";
  }
}

/** Returns the id only if it's a known size id, else null (for API validation). */
export function validTitleSize(id: unknown): TitleSizeId | null {
  return typeof id === "string" && (TITLE_SIZE_IDS as readonly string[]).includes(id)
    ? (id as TitleSizeId)
    : null;
}
