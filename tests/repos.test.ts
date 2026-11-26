/** S5-05 (STR-3): collection names live only in lib/server/repos; stored-data types are not cast away. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "@/lib/server/repos/collections";

const ROOT = path.resolve(__dirname, "..");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
};
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
// `lib/firestore/*` is the browser-SDK layer (it cannot read these collections under the rules; its leftovers go in S5-11).
const files = ["app", "components", "lib"].flatMap((d) => walk(path.join(ROOT, d))).filter((f) => !rel(f).startsWith("lib/server/repos/") && !rel(f).startsWith("lib/firestore/"));

describe("repositories (S5-05)", () => {
  it("no collection name is written as a literal outside lib/server/repos", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const lines = readFileSync(f, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (/\.collection\(\s*["'`]/.test(line) || /\.doc\(\s*["'`][^"'`]*\//.test(line) || /collectionGroup\(/.test(line)) offenders.push(`${rel(f)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders, "use the accessors in lib/server/repos/collections.ts").toEqual([]);
  });

  it("no stored-data type is forced with `as unknown as`", () => {
    const offenders = files.filter((f) => /as unknown as (GalleryDoc|UserDoc|PaymentDoc|StripeEventDoc|PlanDoc)\b/.test(readFileSync(f, "utf8"))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("every collection has a distinct name, and the names are the ones the app has always used (no data moved)", () => {
    expect(Object.values(COLLECTIONS).sort()).toEqual(
      ["audit_log", "contactMessages", "customer_notices", "demo_galleries", "favorites", "galleries", "gallery_selections", "payments", "plans", "promoCodes", "stripe_events", "users"].sort(),
    );
  });
});
