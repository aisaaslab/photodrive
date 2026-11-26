# S6 — New landing page (Concept B "Cinematic Dark")

**Phase:** 3 · Redesign and foundation
**Goal:** The chosen dark landing page is live: server-rendered with instant prices, fast, accessible, responsive and correct in all six languages.
**Entry:** S5 done (tokens, primitives, i18n split, repos). Decisions D2, D4, D11, D13, D14 answered or on defaults.
**Exit (done when):** Owner signs off; Lighthouse mobile LCP ≤ 2.5 s, CLS ≤ 0.1, Accessibility ≥ 95, SEO ≥ 95; prices are in the initial HTML; six languages pass at 1440/1024/390; analytics and the demo flow work.
**Decisions needed:** D2, D4, D11 (mobile), D13 (`/lp/*`), D14 (demo/video/trust). Spec: `02-landing-design-brief.md`.

## Tasks

- [ ] **S6-00** · M · **Design addendum in Figma (Concept B page):** frames for "Try it now" (DemoForm), tutorial video block, trust/"Why PhotoDrive" cards, **390 px mobile frames** (nav, hero, bento, pricing, FAQ), and Greek/German long-text checks. Owner reviews before build.
  - Files: Figma file `Aq966rDz8wrtnqVsk5esPB`, page "B · Cinematic Dark"
  - Done when: node ids of the new frames are added to `02-landing-design-brief.md`; owner approves.
  - Refs: G2, G4 · D11, D14
- [ ] **S6-01** · S · Confirm D2, D4, D11, D13, D14 in the decision log.
  - Done when: statuses updated.
- [ ] **S6-02** · M · Server-render the landing: `app/page.tsx` becomes a server component; public plans via `listPublicPlans()` cached with a tag and revalidated by admin plan routes; language from the cookie (S5-06); client islands only for nav, billing toggle, demo form. Read the Next 16 caching docs first.
  - Files: `app/page.tsx`, `lib/server/repos/plans.ts`, `app/api/admin/plans/*`
  - Done when: view-source shows the price cards; admin plan edit updates the page within the cache window.
  - Refs: STR-5 · D16
- [ ] **S6-03** · M · `NavBar` (auth-aware client island, hamburger on small screens) and `Footer`.
  - Files: `components/landing/NavBar.tsx`, `components/landing/Footer.tsx`
  - Done when: matches node `5:14` (nav) and `8:296`; keyboard and screen-reader checked.
- [x] **S6-04** · L · Hero + product preview: gradients over the hero photo, badge, two-line H1 with gradient line 2, CTAs, checks, 1120×560 gallery window with three floating chips and the bottom fade. Hero image `priority`.
  - Files: `components/landing/Hero.tsx`, `GalleryWindow.tsx`, `FloatingChip.tsx`
  - Done when: matches node `5:14` at 1440.
- [x] **S6-05** · M · Built-for strip and How-it-works (4 equal-height steps with connectors).
  - Done when: matches nodes `5:149`, `5:166`.
- [x] **S6-06** · L · Features bento (row 1: photo-mosaic card + live-sync card; rows 2–3 equal cards) and Client-experience section (lightbox mock with thumbnails).
  - Done when: matches nodes `8:2`, `8:100`.
- [x] **S6-07** · L · Pricing: move `buildTiers`/`discountPct` to `lib/shared/pricing.ts` with unit tests; `BillingToggle` island; `PlanCard` (highlight state); money via `lib/shared/money.ts` in the plan's own currency (D4); "One-time payment · no auto-renewal"; "Secure checkout powered by Stripe"; fallback card when no plans exist; CTA links to `/subscribe?plan=<id>`.
  - Depends: S2-05, S6-02
  - Done when: matches node `8:151`; currency tests pass (USD, EUR, zero-decimal); toggle hidden when only one interval exists.
  - Refs: PAY-6
- [x] **S6-08** · M · FAQ (accessible accordion, real content from `app/faq/page.tsx`) and Final CTA panel.
  - Done when: matches nodes `8:256`, `8:286`.
- [ ] **S6-09** · M · Preserve conversion features per D14: restyle `DemoForm` ("Try it now"), `DemoVideo`, and fold `TrustSection` content into the page; remove or relocate the compare slider. **Copy must not promise anything D3 contradicts** (see S9-07).
  - Depends: S6-00
  - Files: `components/demo/DemoForm.tsx`, `components/DemoVideo.tsx`, `components/TrustSection.tsx`
  - Done when: demo creation works end to end; frames match the S6-00 addendum.
- [ ] **S6-10** · M · i18n: add the new strings in six languages (see brief), reuse existing keys; screenshot review of every section at 1440/1024/390 in EL, EN, NL, DE, ES, IT.
  - Done when: no clipping, overflow or untranslated keys; `i18n:check` green.
- [ ] **S6-11** · M · Responsive build per the brief's breakpoints (and the S6-00 mobile frames) and an accessibility pass: contrast AA, visible focus, keyboard operation, reduced motion, landmarks, alt text.
  - Done when: axe/Lighthouse accessibility ≥ 95; manual keyboard walkthrough recorded.
- [ ] **S6-12** · M · SEO and performance: metadata, restyled `opengraph-image.tsx`, JSON-LD (Organization, SoftwareApplication, FAQPage), `sizes` and priority on images, analytics (`SiteAnalytics`, tracking IDs, `trackPurchase`) unchanged; Lighthouse targets met.
  - Files: `app/page.tsx`, `app/opengraph-image.tsx`, `app/sitemap.ts`
  - Done when: Lighthouse report saved in `evidence/S6.md`.
- [ ] **S6-13** · M · Migrate `/lp/*` pages and `components/Hero.tsx`, `components/lp/*` to the tokens/primitives (D13): same URLs, same content.
  - Files: `app/lp/*`, `components/Hero.tsx`, `components/lp/*`
  - Done when: no second design language remains; LP URLs still render and track.
  - Refs: STR-7
- [ ] **S6-14** · S · Node-by-node visual QA against Figma, deviations logged and approved, remove the old landing components, merge and go live after owner sign-off on a preview URL.
  - Done when: owner sign-off recorded in `evidence/S6.md`; production serves the new page.

## Risks and notes

- The mock-up is desktop-only; do not start S6-03 before the S6-00 mobile frames are approved (or D11 explicitly changed).
- Prices in the mock-up are samples; render from admin plans only.
- A server-rendered page that reads a language cookie is dynamic; keep plan data cached so it stays fast.
