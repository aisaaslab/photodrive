import type { Translations } from "@/lib/i18n";
import { APP_NAME, APP_URL } from "@/lib/branding";
import { fromMinorUnits } from "@/lib/shared/money";
import type { PublicPlan } from "@/lib/shared/pricing";
import { faqLd, jsonLdScript, organizationLd, softwareLd, type Faq } from "@/lib/shared/structured-data";

/** Structured data for search engines: the organisation, the product with its public plans, and the FAQ shown on the page. */
export function JsonLd({ t, plans, faq }: { t: Translations; plans: PublicPlan[]; faq: Faq[] }) {
  const url = APP_URL.replace(/\/$/, "");
  const graphs = [
    organizationLd(APP_NAME, url, `${url}/logo.png`),
    softwareLd(APP_NAME, url, t.landing.hero.lead, plans, fromMinorUnits),
    faqLd(faq),
  ];
  return <>{graphs.map((g, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(g) }} />)}</>;
}
