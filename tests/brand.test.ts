/** The product is PhotoDrive. The project's earlier working name was removed everywhere at the owner's request; this keeps it out. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const SKIP = new Set(["node_modules", ".git", ".next", "coverage", "out"]);
// Built from pieces so this file does not contain the word it forbids.
const OLD = new RegExp(["gal", "le+", "roo"].join(""), "i");
const BINARY = /\.(png|jpe?g|gif|webp|ico|mp4|webm|woff2?|ttf|otf|pdf|zip)$/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe("brand", () => {
  const files = walk(ROOT);

  it("no file or folder is named after the earlier name", () => {
    expect(files.filter((f) => OLD.test(path.relative(ROOT, f)))).toEqual([]);
  });

  it("no text file mentions the earlier name (source, docs, templates, lockfile)", () => {
    const offenders = files
      .filter((f) => !BINARY.test(f))
      .filter((f) => OLD.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});
