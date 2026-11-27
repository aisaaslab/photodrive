/**
 * S4-08: server-only code must never reach the browser. The real guard is `import "server-only"` (a Next build fails if a client
 * bundle pulls such a module in). These tests make the rule visible early and with a readable message: the chain of imports that
 * leads from a Client Component to a server module, instead of a bundler error.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIRS = ["app", "components", "lib"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const files = SOURCE_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const src = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

const isGuarded = (f: string) => /^\s*import\s+["']server-only["']/m.test(src.get(f) ?? "");
const isClient = (f: string) => /^(?:\s*\/\/[^\n]*\n|\s*\/\*[\s\S]*?\*\/)*\s*["']use client["']/.test(src.get(f) ?? "");

/** Static, non-type imports (and dynamic import()s, which also end up in the bundle) of a file, resolved to files in this repo. */
function importsOf(file: string): string[] {
  const text = src.get(file) ?? "";
  const specs = [
    ...text.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm),
    ...text.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
    ...text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);
  const resolved: string[] = [];
  for (const spec of specs) {
    const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(file), spec) : null;
    if (!base) continue;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
      if (src.has(candidate)) { resolved.push(candidate); break; }
    }
  }
  return resolved;
}

describe("server-only guard (S4-08)", () => {
  it("every module under lib/server and the known server helpers is marked server-only", () => {
    const mustBeGuarded = files.filter((f) => rel(f).startsWith("lib/server/")).map(rel);
    mustBeGuarded.push(
      "lib/email.ts", "lib/site-settings.ts", "lib/plans.ts", "lib/promo-codes.ts", "lib/tracking-settings.ts", "lib/stripe/activate.ts",
      "lib/firebase/admin.ts", "lib/firebase/admin-guard.ts", "lib/drive/client.ts",
      "lib/gallery/password.ts", "lib/gallery/session.ts", "lib/gallery/password-vault.ts",
    );
    const missing = mustBeGuarded.filter((r) => !isGuarded(path.join(ROOT, r)));
    expect(missing, `add \`import "server-only";\` to: ${missing.join(", ")}`).toEqual([]);
  });

  it("no Client Component (and nothing it imports, however indirectly) reaches a server-only module", () => {
    const problems: string[] = [];
    for (const start of files.filter(isClient)) {
      const seen = new Set<string>([start]);
      const queue: string[][] = [[start]];
      while (queue.length) {
        const chain = queue.shift()!;
        for (const next of importsOf(chain[chain.length - 1])) {
          if (seen.has(next)) continue;
          seen.add(next);
          const nextChain = [...chain, next];
          if (isGuarded(next) || rel(next).startsWith("lib/server/")) problems.push(nextChain.map(rel).join("  ->  "));
          else queue.push(nextChain);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("the check itself works: it finds client files, follows aliases, and sees guarded modules", () => {
    expect(files.filter(isClient).length).toBeGreaterThan(20);
    expect(importsOf(path.join(ROOT, "app/api/photos/proxy/route.ts")).map(rel)).toContain("lib/server/drive-stream.ts");
    expect(isGuarded(path.join(ROOT, "lib/server/media-token.ts"))).toBe(true);
    expect(isGuarded(path.join(ROOT, "lib/shared/money.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "lib/shims/server-only.ts"))).toBe(true);
  });

  it("pure modules shared with the browser live outside lib/server", () => {
    expect(files.map(rel)).toContain("lib/shared/billing-access.ts");
    expect(isGuarded(path.join(ROOT, "lib/shared/billing-access.ts"))).toBe(false);
  });
});
