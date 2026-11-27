import { describe, expect, it } from "vitest";
import { faqLd, jsonLdScript, organizationLd, softwareLd } from "@/lib/shared/structured-data";
import { fromMinorUnits } from "@/lib/shared/money";
import type { PublicPlan } from "@/lib/shared/pricing";

const plan = (over: Partial<PublicPlan>): PublicPlan => ({ id: "p1", name: "Pro", description: "", interval: "yearly", priceCents: 9900, currency: "usd", features: [], highlight: false, sortOrder: 0, ...over });

describe("structured data (S6-12)", () => {
  it("organization", () => {
    expect(organizationLd("PhotoDrive", "https://x.test", "https://x.test/logo.png")).toMatchObject({ "@type": "Organization", name: "PhotoDrive", url: "https://x.test" });
  });
  it("software application lists one offer per plan, in the plan's own currency and major units", () => {
    const ld = softwareLd("PhotoDrive", "https://x.test/", "d", [plan({}), plan({ id: "p2", interval: "monthly", priceCents: 1200 }), plan({ id: "p3", currency: "jpy", priceCents: 500 })], fromMinorUnits);
    const offers = (ld as { offers: { price: string; priceCurrency: string; url: string }[] }).offers;
    expect(offers.map((o) => [o.price, o.priceCurrency])).toEqual([["99.00", "USD"], ["12.00", "USD"], ["500.00", "JPY"]]);
    expect(offers[0].url).toBe("https://x.test/subscribe?plan=p1");
  });
  it("software application has no offers when there are no public plans (never a made-up price)", () => {
    expect(softwareLd("PhotoDrive", "https://x.test", "d", [], fromMinorUnits)).not.toHaveProperty("offers");
  });
  it("FAQ page", () => {
    const ld = faqLd([{ question: "Q1?", answer: "A1" }]);
    expect(ld.mainEntity[0]).toEqual({ "@type": "Question", name: "Q1?", acceptedAnswer: { "@type": "Answer", text: "A1" } });
  });
  it("serialising cannot break out of the script tag", () => {
    const out = jsonLdScript({ text: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).text).toBe("</script><script>alert(1)</script>");
  });
});
