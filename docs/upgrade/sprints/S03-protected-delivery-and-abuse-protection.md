# S3 — Protected photo delivery and abuse protection

**Phase:** 2 · Security
**Goal:** Photos are served only as the gallery allows, abuse is rate-limited across servers, and basic hardening is in place.
**Entry:** S2 done (R1 gate passed). Decisions D6 and **D15** answered.
**Exit (done when):** For galleries in the protected tier, no Drive id or Drive URL reaches the client and every image/original request is signed, gallery-bound and rate-limited; repeated wrong passwords lock out; rate limits work across serverless instances; security headers are in report-only mode.
**Decisions needed:** D6 (rate-limit store: needs the Upstash credentials), D15 (delivery model: **decided, option A, tiered**) and D18 (gallery visibility: **decided**), see `03-target-architecture.md` §3. The *protected tier* means **private galleries and galleries with downloads disabled**. State the limits plainly: the Drive folder itself stays public, so this protects against bypassing the gallery, not against a leaked folder link.

## Tasks

- [x] **S3-01** · M · Shared rate limiter `lib/server/rate-limit.ts` (Upstash Redis in staging/production, in-memory fallback for dev/tests); hashed IP keys; unit tests for window and lockout logic.
  - Files: `lib/server/rate-limit.ts`, `package.json`, `.env.example`
  - Done when: limits hold across two simulated instances in a test; env vars documented.
  - Refs: SEC-2
- [~] **S3-13** · M · Gallery visibility (D18): an explicit `visibility: "public" | "private"` on every gallery. Private requires a password, public has none. Existing galleries are derived (has a password = private, otherwise public) so nothing changes for them. The create/edit forms replace the optional password toggle with a Public / Private choice, and Private shows a required password field; the API enforces the same rules; switching private to public removes the password after confirmation; the dashboard and admin gallery views show the mode. Six languages.
  - Files: `lib/gallery/visibility.ts` (derive + rules), `lib/firestore/types.ts`, `app/api/galleries/route.ts`, `app/api/galleries/[id]/route.ts`, `components/dashboard/NewGalleryForm.tsx`, `components/dashboard/GalleryCard.tsx`, `app/api/admin/galleries/*`, `lib/i18n`
  - Done when: unit and route tests for the rules; a private gallery cannot be created or saved without a password; a public gallery never keeps one; existing galleries behave identically; copy reviewed in all six languages.
  - Refs: D18, D15, SEC-1
- [x] **S3-02** · L · Media signing and delivery: `lib/server/media-token.ts` (opaque photo tokens, signed URLs with 6-hour expiry buckets) and `/api/g/[galleryId]/media/[token]` enforcing gallery existence/not disabled, folder-membership (cached listing), gallery cookie for protected galleries, `allowDownload` for `size=full`, signature + expiry, rate limit, correct cache headers, Range support for video.
  - Depends: S3-01, S3-13
  - Files: `lib/server/media-token.ts`, `app/api/g/[galleryId]/media/[token]/route.ts`
  - Done when: unit + route tests cover every denial path and a valid signed request streams bytes.
  - Refs: SEC-1 · Decision D15
- [x] **S3-03** · L · Client payload and consumers for the **protected tier** (private galleries and galleries with downloads disabled): the gallery page sends opaque tokens and signed URLs instead of Drive ids/`thumbnailLink`s; update every consumer; keep Google-CDN delivery for the public tier.
  - Depends: S3-02, S3-13
  - Files: `app/gallery/[slug]/page.tsx`, `lib/drive/public-url.ts`, `components/gallery/PhotoTile.tsx`, `components/gallery/Lightbox.tsx`, `components/gallery/HeroImage.tsx`, `components/gallery/MasonryGrid.tsx`, `components/dashboard/GalleryCard.tsx`, `components/dashboard/CoverPickerModal.tsx`, `app/api/galleries/[id]/download-all/route.ts`
  - Done when: in a private gallery, the rendered HTML and network log contain no Drive file id and no `googleusercontent`/`drive.usercontent` URL; public galleries behave as before.
- [x] **S3-04** · M · Harden the legacy `/api/photos/proxy` (still used for public galleries and the dashboard): require a gallery id, verify folder membership, rate limit, honour `allowDownload` and the password cookie for `size=full`, `private` cache headers for protected galleries.
  - Depends: S3-01
  - Files: `app/api/photos/proxy/route.ts`, callers
  - Done when: a foreign file id returns 403; a protected gallery's original requires the cookie.
- [x] **S3-05** · M · Password verification: lockout (5 failures / 10 min per IP+gallery → 15 min), generic error text, zod body parse (no crash on bad JSON), cookie `secure` in production.
  - Depends: S3-01
  - Files: `app/api/gallery/verify-password/route.ts`
  - Done when: tests prove lockout, bad-body 400, `Secure` flag.
  - Refs: SEC-2, SEC-3
- [x] **S3-06** · S · Replace the in-memory limiters in contact and selection-submit with the shared limiter.
  - Depends: S3-01
  - Files: `app/api/contact/route.ts`, `app/api/galleries/[id]/selection/submit/route.ts`
  - Done when: both `Map`s are gone; limits verified.
- [x] **S3-07** · M · Demo limit and cleanup: rolling 3 per 24 h per IP via the limiter (drop the all-time query); store `expiresAtTs` (Timestamp) and enable a Firestore TTL policy; fallback cleanup cron `/api/cron/cleanup`.
  - Depends: S3-01
  - Files: `app/api/demo/create/route.ts`, `app/api/cron/cleanup/route.ts`, `vercel.json`
  - Done when: a person is not blocked forever; expired demos disappear.
- [~] **S3-08** · S · Security headers in `next.config.ts`: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors`; CSP in **report-only** first (allow analytics, fonts, Drive/Google image hosts, Stripe redirects).
  - Files: `next.config.ts`
  - Done when: headers visible on all routes; CSP report endpoint receives no violations for normal flows in staging.
  - Refs: SEC-3
- [x] **S3-09** · M · Input validation with zod: shared `parseJson()` helper and schemas for verify-password, demo/create, contact, galleries POST/PATCH, selection routes; consistent 400 payloads.
  - Files: `lib/shared/schemas/*`, `lib/server/http.ts` (first version)
  - Done when: no unguarded `req.json()` remains in the listed routes.
  - Refs: SEC-3
- [ ] **S3-10** · S · Security regression tests: foreign file id denied; `full` denied when downloads are off; protected media denied without cookie; expired/forged signature denied; lockout works; rate limits hold.
  - Depends: S3-02 … S3-05
  - Done when: tests run in CI.
- [ ] **S3-11** · S · Measure and decide: Drive API quota and hosting bandwidth for protected galleries before/after (sample galleries of 100 / 500 / 1,000 photos); record numbers and whether the protected tier is enabled by default or per gallery.
  - Files: `docs/upgrade/evidence/S3.md`
  - Done when: D15 final choice recorded in the decision log.
- [ ] **S3-12** · S · Document the protection model (what is and is not protected) in `docs/security-model.md` and a short FAQ/Help entry source text in English for translation.
  - Done when: reviewed by the owner.

## Risks and notes

- S3-03 is the riskiest task: touching every image path. Ship behind an env flag (`MEDIA_PROTECTED_TIER=1`), test on staging with real galleries.
- Signed URLs must remain cacheable within a bucket; do not put a per-request nonce in them.
- Videos need Range support; test seeking.
