# S10 — Engagement features: selection export, gallery stats, Drive folder check

**Phase:** 4 · New features
**Goal:** Photographers can act on their clients' selections, see how galleries are used, and set up a gallery correctly the first time.
**Entry:** S9 done (or in parallel from S8 for S10-01/S10-03).
**Exit (done when):** Each feature works end to end in six languages and is covered by tests; gate R4 passed.
**Decisions needed:** none.

## Tasks

- [x] **S10-01** · M · Selection export: owner endpoint `GET /api/galleries/[id]/selection/export?format=txt|csv&ext=keep|strip` returning the picked filenames (newline/comma lists for Lightroom); UI buttons "Copy filenames" and "Download CSV" on the selection view; tests.
  - Files: `app/api/galleries/[id]/selection/export/route.ts`, `components/dashboard/*`
  - Done when: copying yields exactly the selected filenames; a non-owner gets 404.
  - Refs: F2
- [x] **S10-02** · L · Gallery stats: record views, downloads and favourites server-side into `gallery_stats/{galleryId}` (+ 30 daily buckets); dedupe views per visitor session cookie; no personal data; dashboard card shows counts and last visit; privacy note in docs.
  - Files: `lib/server/repos/galleryStats.ts`, `app/gallery/[slug]/page.tsx`, media route, `components/dashboard/GalleryCard.tsx`
  - Done when: counts match a scripted visit pattern; reloads do not inflate views.
  - Refs: F3
- [x] **S10-03** · M · Drive folder check: `POST /api/drive/check` takes a folder URL and reports accessible/public, number of supported files, sub-folders, empty or unsupported states, with friendly error codes; used live in the create/edit form; translated in six languages.
  - Files: `app/api/drive/check/route.ts`, `components/dashboard/NewGalleryForm.tsx`, `lib/drive/client.ts`
  - Done when: private, empty, invalid and valid folders each show the right message before the gallery is created; rate limited.
  - Refs: F4
- [ ] **S10-04** · S · Polish: translations, accessibility and empty states for the three features; short user-facing help text; update the README feature list.
  - Done when: strings reviewed; keyboard and screen-reader pass.
- [ ] **S10-05** · M · **Gate R4 — Phase 4 release:** feature tests green in CI, regression checklist for dashboard and gallery, reminders verified on a fake clock, D3 behaviour verified, release notes drafted.
  - Done when: R4 checklist ticked and evidence committed.

## Risks and notes

- Stats must not slow gallery loads: write counters asynchronously and keep them best-effort.
- The folder check uses the Drive API key quota; cache results for a short time per folder.
