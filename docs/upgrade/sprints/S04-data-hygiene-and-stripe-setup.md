# S4 — Data hygiene and Stripe setup

**Phase:** 2 · Security
**Goal:** Data is kept correct and cleaned up properly; Stripe is configured for EU customers (customer records, invoices, local payment methods).
**Entry:** S3 done.
**Exit (done when):** Original sign-up dates are preserved; deleting a gallery or account removes related selections; Firestore rules are tested; invoices and local payment methods work in test mode; gate R2 passed.
**Decisions needed:** D10 (tax scope; default out of scope).

## Tasks

- [~] **S4-01** · M · Fix `createdAt` reset: set it only when the profile is created (never in later upserts); one-off script to restore historical `createdAt` from Firebase Auth creation time (dry-run first).
  - Files: `lib/firestore/users.ts`, `components/auth/AuthProvider.tsx`, `scripts/migrations/restore-created-at.ts`
  - Done when: signing in twice leaves `createdAt` unchanged (test); script report reviewed.
  - Refs: SEC-4
- [ ] **S4-02** · M · Cascade deletes: `deleteGalleryCascade(galleryId)` and account deletion remove `gallery_selections` (and any legacy `favorites`); batched; tests.
  - Files: `app/api/galleries/[id]/route.ts`, `app/api/user/delete/route.ts`, `lib/server/repos/galleries.ts`
  - Done when: no orphaned selection documents after delete (emulator test).
  - Refs: SEC-4
- [ ] **S4-03** · S · Firestore rules: add `planId`, `planName`, `planInterval`, `subscriptionSource`, `promoCode`, `remindersSent` to `locked()`; rules unit tests (`@firebase/rules-unit-testing`); update the stale "Galleroo" comment.
  - Files: `firestore.rules`, `tests/rules/*.test.ts`
  - Done when: client attempts to write any locked field are denied in tests.
  - Refs: SEC-7
- [ ] **S4-04** · M · Legacy plaintext passwords: one-off migration script (seal and clear), then remove the migrate-on-read writes from list endpoints; keep `forOwner` fallback until the script has run in production.
  - Files: `scripts/migrations/seal-legacy-passwords.ts`, `lib/gallery/password-vault.ts`, `app/api/galleries/route.ts`, `app/api/admin/users/route.ts`
  - Done when: no read endpoint writes to Firestore; migration report shows zero plaintext left.
  - Refs: SEC-8
- [ ] **S4-05** · L · Stripe customer per user: create/look up once, store `stripeCustomerId`, pass `customer` to Checkout (instead of `customer_email`); handle existing users without an id; tests.
  - Files: `lib/server/billing/stripe.ts`, `app/api/stripe/checkout/route.ts`
  - Done when: the second purchase by a user reuses the same Stripe customer.
  - Refs: PAY-5
- [ ] **S4-06** · M · Invoices and receipts: `invoice_creation` enabled with plan name and metadata; show "Download invoice" on the Account page (hosted invoice link); document the receipt email settings in the Stripe dashboard. Tax/VAT stays out of scope unless D10 changes.
  - Depends: S4-05
  - Files: `app/api/stripe/checkout/route.ts`, `app/dashboard/account/page.tsx`
  - Done when: a test-mode purchase produces an invoice reachable from Account.
- [ ] **S4-07** · M · Local payment methods: remove the pinned `payment_method_types: ["card"]`, enable dynamic methods in the dashboard (e.g. iDEAL, SEPA, Bancontact, Klarna as the owner chooses); make sure delayed methods work through `async_payment_succeeded/failed`; "payment processing" state on the thank-you page.
  - Depends: S2-02
  - Files: `app/api/stripe/checkout/route.ts`, `app/thank-you/page.tsx`, `docs/upgrade/04-environments-testing-release.md`
  - Done when: an iDEAL and a SEPA test payment complete (async) and activate access.
  - Refs: PAY-5
- [ ] **S4-08** · S · `import "server-only"` in every server-only module (`password-vault`, `site-settings`, `email`, billing, repos); lint rule or CI check that client files cannot import them.
  - Done when: an accidental client import fails the build.
  - Refs: SEC-9
- [ ] **S4-09** · M · **Gate R2 — production rollout of Phase 2:** provision the rate limiter and secrets in production, enable payment methods and invoice settings in the Stripe dashboard, flip `MEDIA_PROTECTED_TIER` per S3-11 decision, promote CSP from report-only to enforcing after ≥ 3 clean days.
  - Depends: S3-*, S4-01 … S4-08
  - Done when: R2 checklist ticked and evidence committed.

## Risks and notes

- Creating Stripe customers for existing users must not duplicate customers (search by `metadata.uid` first).
- `createdAt` restoration changes dates shown in admin; review the dry-run output.
