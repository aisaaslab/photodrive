# S5 — Foundation: shared code layer and design system

**Phase:** 3 · Redesign and foundation
**Goal:** One shared server layer, one design language (Concept B tokens), per-language translations and smaller files, so the landing page and admin rebuild are fast and safe.
**Entry:** S4 done (R2 gate). Decisions D1, D8, D9, D16 answered or on their defaults.
**Exit (done when):** All API routes use `requireUser` / `requireAdmin` and `route()`; collection names live only in repos; tokens from Concept B drive the UI primitives; only the active language is shipped; the largest components are split with no behaviour change; the dashboard and client gallery use the tokens and type.
**Decisions needed:** D1 (brand name), D8 (typeface + Greek check), D9 (dashboard scope), D16 (language routing).

## Tasks

- [ ] **S5-01** · S · Resolve D1/D8/D9/D16; confirm **Manrope Greek glyph coverage** (render Greek, uppercase and accented samples); decide Manrope vs IBM Plex Sans; plan `next/font` subsets.
  - Files: `app/layout.tsx`, `00-proposal-traceability-and-decisions.md`
  - Done when: decisions logged; font choice proven with a screenshot of Greek text.
- [ ] **S5-02** · M · Design tokens from `02-landing-design-brief.md` in Tailwind v4 `@theme` (colours, radii, spacing, shadows, font); semantic utility names; keep existing pages visually stable; remove the misleading `rose` naming.
  - Files: `app/globals.css`, `app/layout.tsx`
  - Done when: tokens documented; existing pages render unchanged (spot-check list).
  - Refs: STR-7
- [ ] **S5-03** · L · UI primitives in `components/ui/`: `Button`, `Pill`, `Chip`, `Card`, `IconTile`, `Input`, `Toggle`, `Accordion`, `Badge`, `Tabs`, `SectionHeader` (+ existing `Modal`, `Toast` restyled); variants with `clsx` + `tailwind-merge`; a `/dev/ui` kitchen-sink page (not in production builds).
  - Depends: S5-02
  - Done when: every primitive has states (hover, focus, disabled) shown on `/dev/ui`.
- [ ] **S5-04** · M · Shared server layer: `lib/server/auth.ts` (`requireUser`, `requireAdmin`), `lib/server/http.ts` (`route()` wrapper with auth, zod parse, error mapping, Sentry capture, request id); migrate the 9 duplicated routes and remove `getUid` copies.
  - Depends: S3-09
  - Files: `lib/server/auth.ts`, `lib/server/http.ts`, all routes listed in STR-2
  - Done when: `grep -r "verifyIdToken" app` finds no route-level copies.
  - Refs: STR-2
- [ ] **S5-05** · M · Repositories in `lib/server/repos/*` for users, galleries, plans, payments, selections, demos; collection names only there; types in `lib/firestore/types.ts` match stored data (`GalleryDoc`, `UserDoc`, `PaymentDoc`, `StripeEventDoc`).
  - Depends: S5-04
  - Done when: no `collection("…")` string literals outside `lib/server/repos` and `scripts/`; no `as unknown as GalleryDoc[]`.
  - Refs: STR-3
- [ ] **S5-06** · L · i18n split: `lib/i18n/{el,en,nl,de,es,it}.ts`, types derived from `en`, only the active language shipped, `lang` **cookie** read on the server (browser detection on first visit), `LanguageProvider` seeded from the server; keep the `useLanguage()` API; `npm run i18n:check` for key parity.
  - Files: `lib/i18n/*`, `components/ClientProviders.tsx`, `app/layout.tsx`
  - Done when: bundle analysis shows one language per page; no hydration flash on language; parity check in CI.
  - Refs: STR-6 · D16
- [ ] **S5-07** · M · Split `GalleryCard` (959 lines) into subcomponents and hooks; no behaviour change.
  - Files: `components/dashboard/GalleryCard.tsx`
  - Done when: no file > 300 lines; manual regression list passes (edit, password, cover, share, download).
  - Refs: STR-4
- [ ] **S5-08** · M · Split `MasonryGrid` (677 lines): grid, selection, download-all, favourites hooks.
  - Files: `components/gallery/MasonryGrid.tsx`
  - Done when: no file > 300 lines; gallery regression list passes.
- [ ] **S5-09** · M · Split `NewGalleryForm` (654 lines): sections + form hook with the zod schema shared with the API.
  - Files: `components/dashboard/NewGalleryForm.tsx`
  - Done when: no file > 300 lines; create/edit flows pass.
- [ ] **S5-10** · M · Split `Lightbox` (571 lines) and `CoverPickerModal` (475 lines).
  - Files: `components/gallery/Lightbox.tsx`, `components/dashboard/CoverPickerModal.tsx`
  - Done when: no file > 300 lines; keyboard navigation and cover picking unchanged.
- [ ] **S5-11** · S · Housekeeping: unify on one zip library (`client-zip` or `jszip`), delete dead `lib/firestore/favorites.ts`, strip BOMs from the 26 files, fix mojibake in `globals.css`, `not-found.tsx`, `ImageCompareSlider.tsx`, `TrustSection.tsx`, `branding.ts`; centralise brand/email defaults in `lib/branding.ts` (no hard-coded `photodrive.co`/"Galleroo" elsewhere, per D1).
  - Done when: lint/type/test green; `grep` for the old strings finds only `branding.ts`.
  - Refs: STR-8
- [ ] **S5-12** · M · Dashboard and client-gallery token migration (D9): colours and typography via tokens only; **no layout changes**; before/after screenshots reviewed.
  - Depends: S5-02, S5-03
  - Done when: the dashboard and gallery look consistent with the new landing tokens; owner approves screenshots.

## Risks and notes

- S5-06 touches 40 files: do it as an automated codemod-style change, not by hand, and keep the old API.
- File-split tasks must not change behaviour; add characterisation tests where logic is extracted.
- If Manrope lacks usable Greek, keep IBM Plex Sans for the app and use Manrope for Latin display only (record in D8).
- Fonts are already self-hosted (done early, after a CI build failed fetching Google Fonts): `app/fonts.css` + `app/fonts/*.woff2` (unmodified `@fontsource` files, OFL licences and sources in `app/fonts/README.md`), no `next/font/google`. S5-01 should add the new typeface (D8, Greek coverage) the same way: copy the unmodified woff2 files for the needed scripts, add `@font-face` rules with `unicode-range`, define the CSS variable in `globals.css`.
