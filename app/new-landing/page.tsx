import type { Metadata } from "next";
import { getLanguage } from "@/lib/i18n/server";
import { Hero } from "@/components/landing/Hero";
import { BuiltFor } from "@/components/landing/BuiltFor";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Features } from "@/components/landing/Features";
import { ClientExperience } from "@/components/landing/ClientExperience";

/**
 * The new landing page (Concept B, "Cinematic Dark"), built section by section behind this URL while the live landing at `/` stays
 * as it is. S6-14 moves it to `/` after the owner signs off a preview. Not indexed until then.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NewLandingPage() {
  const { dictionary: t } = await getLanguage();
  return (
    <main className="bg-canvas font-display text-fg">
      <Hero t={t} />
      <BuiltFor t={t} />
      <HowItWorks t={t} />
      <Features t={t} />
      <ClientExperience t={t} />
    </main>
  );
}
