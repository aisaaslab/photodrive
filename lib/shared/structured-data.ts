/**
 * schema.org structured data (JSON-LD) for the landing page (S6-12): who we are, what the product is and costs, and the FAQ.
 * Pure builders so they can be tested; the page serialises them with `jsonLdScript`.
 */
import type { PublicPlan } from "./pricing";

export type Faq = { question: string; answer: string };

export const organizationLd = (name: string, url: string, logoUrl: string) => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name,
  url,
  logo: logoUrl,
});

/** The product with one Offer per public plan (price in the plan's own currency, as a decimal in major units). */
export const softwareLd = (name: string, url: string, description: string, plans: PublicPlan[], fromMinor: (amount: number, currency: string) => number) => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name,
  url,
  description,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  ...(plans.length > 0 && {
    offers: plans.map((p) => ({
      "@type": "Offer",
      name: `${p.name} (${p.interval})`,
      price: fromMinor(p.priceCents, p.currency).toFixed(2),
      priceCurrency: p.currency.toUpperCase(),
      url: `${url.replace(/\/$/, "")}/subscribe?plan=${p.id}`,
    })),
  }),
});

export const faqLd = (items: Faq[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: i.answer } })),
});

/** JSON for an inline `<script type="application/ld+json">`: `<` is escaped so no text can close the tag early. */
export const jsonLdScript = (data: unknown): string => JSON.stringify(data).replace(/</g, "\\u003c");
