import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("app/globals.css", "utf8");
const hex = (name: string) => /^#([0-9a-f]{6})/i.exec(new RegExp(`--color-${name}:\\s*([^;]+);`).exec(css)![1].trim())![1];
const lin = (c: number) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const lum = (h: string) => 0.2126 * lin(parseInt(h.slice(0, 2), 16)) + 0.7152 * lin(parseInt(h.slice(2, 4), 16)) + 0.0722 * lin(parseInt(h.slice(4, 6), 16));
const ratio = (fg: string, bg: string) => { const [a, b] = [lum(hex(fg)), lum(hex(bg))]; return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };

// Every text colour the landing page draws on a flat token background (WCAG 2.1 AA: 4.5 for normal text, 3 for large text and icons).
const NORMAL: [string, string][] = [
  ["fg", "canvas"], ["fg", "surface"], ["fg", "surface-2"],
  ["fg-soft", "canvas"], ["fg-soft", "surface"], ["fg-soft", "surface-2"],
  ["fg-muted", "canvas"], ["fg-muted", "surface"], ["fg-muted", "surface-2"],
  ["accent", "canvas"], ["accent", "surface"], ["accent", "surface-2"], ["accent", "accent-soft"],
  ["canvas", "accent"], // button label on the accent button
  ["danger", "surface-2"], ["danger", "canvas"], ["success-bright", "surface"],
];
const LARGE: [string, string][] = [["accent-hi", "canvas"], ["accent", "canvas"]]; // the headline gradient runs accent to accent-hi

describe("text colours meet WCAG AA on the backgrounds they are used on (S6-11)", () => {
  for (const [fg, bg] of NORMAL) it(`${fg} on ${bg} is at least 4.5:1`, () => expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5));
  for (const [fg, bg] of LARGE) it(`large text ${fg} on ${bg} is at least 3:1`, () => expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3));
});
