# S2 — Stripe events, reconciliation and back-fill

**Phase:** 1 · Payments and safety net
**Goal:** Every Stripe event is handled and logged, missed payments are caught automatically, money is shown in the right currency in the app, and customers who paid but were not extended are identified and corrected with the owner's approval.
**Entry:** S1 done.
**Exit (done when):** Refunds remove access in test mode; an unmatched payment is retried then surfaced; the reconcile job heals a deliberately dropped webhook; the back-fill report exists and has been reviewed; production rollout (gate R1) is complete and monitored.
**Decisions needed:** D5 (refund/dispute policy), D7 (cron).

## Tasks

- [x] **S2-01** · M · `stripe_events` collection and repo: create-if-absent on receipt, statuses (`processed`, `ignored`, `needs_review`, `failed`), skip already-processed events.
  - Files: `lib/server/repos/stripeEvents.ts`, `app/api/stripe/webhook/route.ts`
  - Done when: replaying the same event id is a no-op and visible in the collection.
- [~] **S2-02** · L · Event handlers per D5: `charge.refunded` (full → `revokeGrant`; partial → flag), `charge.dispute.created/closed`, `checkout.session.async_payment_failed`, `checkout.session.expired`; update `payments.status`.
  - Depends: S2-01
  - Files: `lib/server/billing/events/*.ts`
  - Done when: emulator + signed-fixture tests for each event; Stripe CLI triggers confirm in staging.
  - Refs: PAY-4
- [ ] **S2-03** · M · Unmatched-payment policy: user unresolved and event < 24 h → return 500 (Stripe retries); after 24 h → `needs_review`, 200, Sentry alert; improve user resolution (client reference id, customer metadata, email).
  - Depends: S2-01
  - Done when: tests cover both branches and the alert fires once.
- [ ] **S2-04** · M · Reconciliation cron `/api/cron/reconcile-payments` (Vercel Cron, `CRON_SECRET`): fulfil paid sessions from the last 48 h that have no `payments` doc; alert if repeatedly > 0.
  - Files: `app/api/cron/reconcile-payments/route.ts`, `vercel.json`
  - Done when: dropping a webhook in staging is healed within one run.
- [ ] **S2-05** · M · `lib/shared/money.ts` (`formatMoney`, minor units, locale) and replace every hard-coded `$` in subscribe, Account, admin plans, admin user plan picker and `CreateUserModal`; tests including zero-decimal currencies. (Landing handled in S6-07, admin revenue in S7-04.)
  - Files: `lib/shared/money.ts`, `app/subscribe/page.tsx`, `app/dashboard/account/page.tsx`, `app/dashboard/admin/plans/page.tsx`, `app/dashboard/admin/users/page.tsx`, `components/admin/CreateUserModal.tsx`
  - Done when: no `$${` price formatting remains outside the landing page.
  - Refs: PAY-6
- [ ] **S2-06** · M · Back-fill **report** scripts (read-only): Report A (replay payments with the stacking rule vs current expiry) and Report B (paid Stripe sessions with no `payments` doc) → CSV in `scripts/backfill/out/` (git-ignored).
  - Files: `scripts/backfill/report.ts`
  - Done when: runs against staging fixtures; columns match `03-target-architecture.md`.
  - Refs: PAY-7
- [ ] **S2-07** · S · **Owner review gate:** run the report against production (read-only), share the CSV with the owner, record which rows are approved.
  - Done when: `approved.csv` exists (or "no corrections needed") and the decision is logged in `evidence/S2.md`.
- [ ] **S2-08** · M · Back-fill **apply** script: `--apply --approved approved.csv`; transactional, idempotent, one `audit_log`-style record per user, refuses to run without the file; rehearsed on staging.
  - Depends: S2-06
  - Done when: staging rehearsal passes; production run only after S2-07 approval.
- [ ] **S2-09** · S · Show payment status (`refunded`, `disputed`, `needs_review`) minimally on the existing admin users page until the rebuilt Payments view (S8-01).
  - Done when: an operator can see a refunded payment without opening Stripe.
- [ ] **S2-10** · M · Test-mode evidence for refund, dispute and async-failure scenarios (Stripe CLI triggers), recorded with event ids.
  - Files: `docs/upgrade/evidence/S2.md`
  - Done when: all scenarios pass in staging.
- [ ] **S2-11** · M · **Gate R1 — production rollout of Phase 1:** subscribe the production webhook to the new event types, deploy with `BILLING_FULFIL_V2` off → on, watch Sentry and `stripe_events` for 24 h, schedule removal of the old path one week later, run the approved back-fill.
  - Depends: S2-02 … S2-10
  - Done when: the R1 checklist in `04-environments-testing-release.md` is ticked and evidence committed.
- [ ] **S2-12** · S · One week after R1: delete the old activation path and the `BILLING_FULFIL_V2` flag.
  - Depends: S2-11
  - Done when: no flag references remain.

## Risks and notes

- Refund policy (D5) must be confirmed before S2-02 is merged: it changes customers' access.
- The back-fill never writes anything until the owner approves specific rows.
- Subscribing to more event types changes webhook volume; confirm the Stripe dashboard endpoint settings during R1.
