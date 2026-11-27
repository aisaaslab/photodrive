# S8 — Admin back office II: payments, support, plans, overview, release

**Phase:** 3 · Redesign and foundation
**Goal:** Daily admin tasks run entirely from the new back office, and Phase 3 is released.
**Entry:** S7 done.
**Exit (done when):** Payments, Support, Plans/Promo and Overview screens work from stored data; the old admin is removed; the permission matrix passes; gate R3 is complete.
**Decisions needed:** none.

## Tasks

- [x] **S8-01** · L · Payments: paginated list from `payments` + `stripe_events` with statuses (`paid`, `refunded`, `disputed`, `needs_review`), totals per currency, link to the Stripe dashboard, event history, and a **"re-sync this Checkout session"** action (`fulfilCheckoutSession` with `source: admin`) that writes an audit entry; **Needs attention** queue (unmatched, disputed, partial refunds).
  - Files: `app/api/admin/payments/*`, `app/dashboard/admin/payments/*`
  - Done when: an operator can resolve a needs-review payment without leaving the page.
  - Refs: PAY-4, PAY-6
- [x] **S8-02** · M · Support inbox: list `contactMessages` with read/unread/resolved, search, link to the matching user (account + payments one click away), reply link, optional note.
  - Files: `app/api/admin/messages/*`, `app/dashboard/admin/support/*`
  - Done when: a message can be opened, matched to an account, and marked resolved with an audit entry.
- [x] **S8-03** · M · Plans and promo codes screens: restyle, zod validation, money per currency, live preview of how a plan appears on the landing page, cache revalidation on save.
  - Files: `app/dashboard/admin/plans/*`, `app/dashboard/admin/promo-codes/*`, `components/admin/PlanEditorModal.tsx`
  - Done when: saving a plan updates the landing page (S6-02 tag) and is audited.
- [x] **S8-04** · M · Overview and Settings: key numbers from `stats/overview`, expiring soon, needs-attention counts; settings (support email, tracking IDs) restyled.
  - Depends: S7-04
  - Done when: overview loads from one document read.
  - Refs: SEC-5
- [x] **S8-05** · M · Remove the old admin pages and endpoints; redirects; **permission matrix test** (non-admin → 403, admin → 200 for every admin route).
  - Depends: S8-01 … S8-04
  - Done when: matrix runs in CI.
- [ ] **S8-06** · M · **Gate R3 — Phase 3 release:** landing and admin sign-off, stats counters verified against a full recompute on production data (read-only), runbook entries for admin actions, monitoring for 72 h.
  - Done when: R3 checklist ticked and evidence committed.

## Risks and notes

- Re-sync and admin plan changes are the most sensitive actions: always audited, always confirm in the UI.
- Do not remove the old endpoints until a week of normal operation on the new screens.
