import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/plans", () => ({ listPublicPlans: vi.fn() }));

import { PUBLIC_PLANS_TAG, expirePublicPlans, getPublicPlans } from "@/lib/server/public-plans";
import { listPublicPlans } from "@/lib/plans";

beforeEach(() => { revalidateTag.mockReset(); vi.mocked(listPublicPlans).mockReset(); });

describe("public plans cache (S6-02)", () => {
  it("expires the tag immediately, not stale-while-revalidate", () => {
    expirePublicPlans();
    expect(revalidateTag).toHaveBeenCalledWith(PUBLIC_PLANS_TAG, { expire: 0 });
  });
  it("never throws if the cache cannot be expired", () => {
    revalidateTag.mockImplementation(() => { throw new Error("outside a request"); });
    expect(() => expirePublicPlans()).not.toThrow();
  });
  it("returns only what the page needs, with safe defaults", async () => {
    vi.mocked(listPublicPlans).mockResolvedValue([{ id: "a", name: "Pro", interval: "yearly", priceCents: 9900, currency: "usd", features: ["x"], sortOrder: 1 } as never]);
    expect(await getPublicPlans()).toEqual([{ id: "a", name: "Pro", description: "", interval: "yearly", priceCents: 9900, currency: "usd", features: ["x"], highlight: false, sortOrder: 1 }]);
  });
  it("gives an empty list when the plans cannot be read, so the page shows its fallback", async () => {
    vi.mocked(listPublicPlans).mockRejectedValue(new Error("firestore down"));
    expect(await getPublicPlans()).toEqual([]);
  });
});

describe("every admin plan change expires the landing page cache", () => {
  const count = (file: string) => (readFileSync(file, "utf8").match(/expirePublicPlans\(\)/g) ?? []).length;
  it("create (1 call), update and replace (2 calls), delete (1 call)", () => {
    expect(count("app/api/admin/plans/route.ts")).toBe(1);
    expect(count("app/api/admin/plans/[id]/route.ts")).toBe(3);
  });
});
