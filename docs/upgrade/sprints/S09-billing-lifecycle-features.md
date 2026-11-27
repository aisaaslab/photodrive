# S9 — Billing lifecycle features: reminders, billing page, gallery expiry and download controls

**Phase:** 4 · New features
**Goal:** Customers are reminded before a plan ends, can see and manage their billing in one place, and photographers control how long galleries stay available and when downloads switch off.
**Entry:** S8 done. **Decision D3 answered** (what happens to galleries when a plan lapses).
**Exit (done when):** Reminder emails are sent on schedule to a test account on a fake clock, idempotently; the billing page is live; the gallery behaviour matches D3 and the public copy matches it; per-gallery expiry and download controls are enforced server-side.
**Decisions needed:** **D3 (blocking)**.

## Tasks

- [x] **S9-01** · S · Resolve **D3** with the owner (recommended: grace period of 14 days, then a polite "temporarily unavailable" page; nothing deleted; restored on renewal). Record the exact grace length and the wording.
  - Done when: decision logged as **Decided**.
  - Refs: G5, SEC-6
- [ ] **S9-02** · M · Billing page `/dashboard/billing`: current plan, expiry, status, payment history, invoice links, renew/upgrade button, and a clear "what happens when your plan lapses" block that states the D3 behaviour; links from Account.
  - Files: `app/dashboard/billing/page.tsx`, `app/dashboard/account/page.tsx`
  - Done when: states for active, expiring, in grace, lapsed, comped/lifetime all render correctly in six languages.
- [x] **S9-03** · M · Reminder engine: daily cron `/api/cron/reminders` finds users expiring in 14 and 3 days, plus a lapsed notice; idempotent through `users.remindersSent` keyed by the expiry date; emails via `sendEmail` in the user's language; excludes lifetime/comped; tests with a fake clock.
  - Files: `app/api/cron/reminders/route.ts`, `lib/server/reminders.ts`, `lib/email.ts`, `vercel.json`
  - Done when: running the job twice sends once; test account receives all three emails on a simulated timeline.
  - Refs: F1
- [x] **S9-04** · M · Gallery availability after plan lapse per D3: public page and media route check the owner's status (cached lookup), show the grace banner to the owner, "temporarily unavailable" page to visitors after grace; nothing deleted; restoring on renewal is immediate.
  - Depends: S9-01
  - Files: `app/gallery/[slug]/page.tsx`, `app/api/g/[galleryId]/media/[token]/route.ts`, `lib/server/repos/galleries.ts`
  - Done when: tests for active, grace, lapsed, renewed; owner sees a clear notice in the dashboard.
- [x] **S9-05** · M · Gallery expiry date (feature): optional `expiresAt` per gallery set in create/edit forms; expired galleries show the unavailable page; owner can extend; included in the dashboard card.
  - Files: `lib/shared/schemas/gallery.ts`, `components/dashboard/NewGalleryForm.tsx`, `app/gallery/[slug]/page.tsx`
  - Done when: an expired gallery is unreachable (including media), extending restores it.
- [x] **S9-06** · M · Download control: option "switch off downloads once a selection is submitted" (`disableDownloadAfterSubmit`); enforced server-side in the media route and download-all; UI hides buttons accordingly.
  - Files: `app/api/galleries/[id]/selection/submit/route.ts`, media route, `components/gallery/*`
  - Done when: after submission, original downloads are refused by the server, not just hidden.
- [ ] **S9-07** · S · Align public copy with D3 in six languages: landing "Why PhotoDrive" card ("The link stays live… doesn't expire"), pricing notes, FAQ, Terms, so nothing promises what the product no longer does (or vice versa).
  - Files: `components/TrustSection.tsx`, `lib/i18n/*`, `app/terms/page.tsx`, `app/faq/page.tsx`
  - Done when: owner reviews the changed strings.

## Risks and notes

- Reminders touch real customers: first run in staging with test accounts only; production starts with a dry-run log of recipients for the owner to review.
- Reminder email content must not reveal other users' data; use the user's stored language.
- If D3 stays "galleries stay live forever", S9-04 is cancelled and S9-07 only removes nothing; record that in the sprint.
