# S2 — Stripe events, reconciliation and back-fill

**Phase:** 1 · Payments and safety net
**Goal:** Every Stripe event is handled and logged, missed payments are caught automatically, money is shown in the right currency in the app, and customers who paid but were not extended are identified and corrected with the owner's approval.
**Entry:** S1 done.
**Exit (done when):** Refunds remove access in test mode; customers are told about refunds, disputes and failed payments, and operators are alerted to anything that needs a human; an unmatched payment is retried then surfaced; the reconcile job heals a deliberately dropped webhook; the back-fill report exists and has been reviewed; production rollout (gate R1) is complete and monitored.
**Decisions needed:** D5 (decided), D7 (cron, default Vercel Cron), D17 (channels and SMTP decided; recipient address and wording outstanding).

## Tasks

- [x] **S2-01** · M · `stripe_events` collection and repo: create-if-absent on receipt, statuses (`processed`, `ignored`, `needs_review`, `failed`), skip already-processed events.
  - Files: `lib/server/repos/stripeEvents.ts`, `app/api/stripe/webhook/route.ts`
  - Done when: replaying the same event id is a no-op and visible in the collection.
- [~] **S2-02** · L · Event handlers per D5: `charge.refunded` (full → `revokeGrant`; partial → flag), `charge.dispute.created/closed`, `checkout.session.async_payment_failed`, `checkout.session.expired`; update `payments.status`.
  - Depends: S2-01
  - Files: `lib/server/billing/events/*.ts`
  - Done when: emulator + signed-fixture tests for each event; Stripe CLI triggers confirm in staging.
  - Refs: PAY-4
- [x] **S2-03** · M · Unmatched-payment policy: user unresolved and event < 24 h → return 500 (Stripe retries); after 24 h → `needs_review`, 200, Sentry alert; improve user resolution (client reference id, customer metadata, email).
  - Depends: S2-01
  - Done when: tests cover both branches and the alert fires once.
  - Scope note (D17): the alert is an immediate e-mail to `ADMIN_ALERT_EMAIL` (plus a log line) sent once when *any* event ends in `needs_review` (unmatched payment, partial refund, dispute, payment not found, legacy payment revoked). Sentry and the daily digest are S2-16; customer-facing messages are S2-14 / S2-15.
- [~] **S2-04** · M · Reconciliation cron `/api/cron/reconcile-payments` (Vercel Cron, `CRON_SECRET`): fulfil paid sessions from the last 48 h that have no `payments` doc; alert if repeatedly > 0.
  - Files: `app/api/cron/reconcile-payments/route.ts`, `vercel.json`
  - Done when: dropping a webhook in staging is healed within one run.
- [x] **S2-05** · M · `lib/shared/money.ts` (`formatMoney`, minor units, locale) and replace every hard-coded `$` in subscribe, Account, admin plans, admin user plan picker and `CreateUserModal`; tests including zero-decimal currencies. (Landing handled in S6-07, admin revenue in S7-04.)
  - Files: `lib/shared/money.ts`, `app/subscribe/page.tsx`, `app/dashboard/account/page.tsx`, `app/dashboard/admin/plans/page.tsx`, `app/dashboard/admin/users/page.tsx`, `components/admin/CreateUserModal.tsx`
  - Done when: no `$${` price formatting remains outside the landing page.
  - Refs: PAY-6
- [x] **S2-06** · M · Back-fill **report** scripts (read-only): Report A (replay payments with the stacking rule vs current expiry) and Report B (paid Stripe sessions with no `payments` doc) → CSV in `scripts/backfill/out/` (git-ignored).
  - Files: `scripts/backfill/report.ts`
  - Done when: runs against staging fixtures; columns match `03-target-architecture.md`.
  - Refs: PAY-7
- [ ] **S2-07** · S · **Owner review gate:** run the report against production (read-only), share the CSV with the owner, record which rows are approved.
  - Done when: `approved.csv` exists (or "no corrections needed") and the decision is logged in `evidence/S2.md`.
- [~] **S2-08** · M · Back-fill **apply** script: `--apply --approved approved.csv`; transactional, idempotent, one `audit_log`-style record per user, refuses to run without the file; rehearsed on staging.
  - Depends: S2-06
  - Done when: staging rehearsal passes; production run only after S2-07 approval.
- [x] **S2-09** · S · Show payment status (`refunded`, `disputed`, `needs_review`) minimally on the existing admin users page until the rebuilt Payments view (S8-01).
  - Done when: an operator can see a refunded payment without opening Stripe.
- [ ] **S2-10** · M · Test-mode evidence for refund, dispute and async-failure scenarios (Stripe CLI triggers), recorded with event ids.
  - Files: `docs/upgrade/evidence/S2.md`
  - Done when: all scenarios pass in staging.
- [x] **S2-13** · S · Persist the user's preferred language on `users/{uid}.language` (set from the app on login and when the language is switched while signed in, through a small authenticated endpoint validated against the six languages) so server-sent messages can use it. Also needed by S9-03.
  - Files: `app/api/user/language/route.ts`, `components/auth/AuthProvider.tsx` (or the language provider), `lib/firestore/types.ts`, `firestore.rules` (`locked()`)
  - Done when: switching language while signed in updates the user document; invalid values are rejected; tests.
  - Refs: G16, D17
- [~] **S2-14** · L · Customer e-mails for payment events through `sendEmail`, in the user's stored language (six languages, native review): refund processed (full: access removed to <date>; partial: access unchanged, we will be in touch), dispute opened (access paused), dispute won (access restored to <date>) / lost, async payment failed. Sent at most once per payment and event (marker on the payment document), best-effort: a send failure is logged and never fails the webhook. Each e-mail states the current access end date and how to reach support; no card data, no other user's data.
  - Depends: S2-02, S2-13, D17
  - Files: `lib/server/notify/customer.ts`, `lib/server/notify/templates/*`, `lib/server/billing/events/dispatch.ts`
  - Done when: tests for each event, six languages render, a replayed event sends nothing twice, a failing mail provider does not change the webhook response; copy reviewed.
  - Note: decide in D17 whether Stripe's own refund receipt e-mails stay on (recommended: yes). Expired (abandoned) Checkout Sessions get no e-mail.
  - Refs: G16
- [~] **S2-15** · M · Customer in-app notices: the Account page payments list shows each payment's status (`refunded`, `partially refunded`, `disputed`, `dispute lost`) with a plain-language explanation, and the dashboard shows a banner when access was reduced or paused because of a refund or dispute. Six languages.
  - Depends: S2-02
  - Files: `app/dashboard/account/page.tsx`, `app/dashboard/page.tsx`, `lib/i18n`, the payments API the account page reads
  - Done when: each status renders correctly; a refunded customer sees why their access shrank without contacting support.
  - Refs: G16
- [~] **S2-16** · S · Operator alert channels beyond the immediate e-mail (S2-03): Sentry alert when S0-06 exists, and a daily digest e-mail of open `needs_review` events and payments through the cron infrastructure of S2-04; counts also feed the Overview "needs attention" numbers (S8-04).
  - Depends: S2-03, S2-04, S0-06
  - Files: `app/api/cron/needs-review-digest/route.ts`, `lib/server/notify/admin.ts`
  - Done when: an old unresolved needs_review item appears in the next digest and not in one after it is resolved; the Sentry alert fires once per event.
  - Refs: G16
- [ ] **S2-11** · M · **Gate R1 — production rollout of Phase 1:** subscribe the production webhook to the new event types, deploy with `BILLING_FULFIL_V2` off → on, watch Sentry and `stripe_events` for 24 h, schedule removal of the old path one week later, run the approved back-fill.
  - Depends: S2-02 … S2-10, S2-13 … S2-16
  - Done when: the R1 checklist in `04-environments-testing-release.md` is ticked and evidence committed.
- [ ] **S2-12** · S · One week after R1: delete the old activation path and the `BILLING_FULFIL_V2` flag.
  - Depends: S2-11
  - Done when: no flag references remain.

## Parking lot

- Plans store `priceCents` as price x 100 and the admin plan form always creates USD plans. Before any zero-decimal plan (e.g. JPY) is created (D4 option B), the plan editor must take the currency and convert with `minorUnitDigits` (`lib/shared/money.ts`), otherwise Stripe would charge 100x the displayed price. Display is already correct for any currency.

## Risks and notes

- Refund policy (D5) was confirmed by the owner on 2026-11-25 (default policy); it changes customers' access, so it stays behind `BILLING_FULFIL_V2` until R1.
- The back-fill never writes anything until the owner approves specific rows.
- Subscribing to more event types changes webhook volume; confirm the Stripe dashboard endpoint settings during R1.
