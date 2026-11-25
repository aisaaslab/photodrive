# S1 — Payment core

**Phase:** 1 · Payments and safety net
**Goal:** Renewals and upgrades always work and give the correct access time, through one clear fulfilment path.
**Entry:** S0 done (staging + tests + CI).
**Exit (done when):** In Stripe **test mode** a new purchase, a renewal after expiry, an early renewal, a monthly→yearly upgrade, a double click and a replayed webhook all produce the correct result; the failing tests that reproduced PAY-1/PAY-2 now pass; tests run on every change.
**Decisions needed:** none blocking (D5 is needed in S2).

## Tasks

- [x] **S1-01** · M · Characterisation tests that reproduce PAY-1 (renewal lockout) and PAY-2 (no extension while active) against the *current* code; mark them as expected failures with a comment pointing at this task.
  - Files: `tests/billing/current-behaviour.emu.test.ts` (emulator suite; `*.emu.test.ts` run under `npm run test:emu`)
  - Done when: both defects are demonstrated by tests and a short note is saved in `evidence/S1.md`.
  - Refs: PAY-1, PAY-2
- [x] **S1-02** · M · Pure access rules `lib/server/billing/access.ts` (`computeExpiry`, `revokeGrant`, lifetime sentinel) with unit tests (stacking, expired, active, lifetime, zero grant, replays).
  - Done when: >95 % branch coverage on the file; matches `03-target-architecture.md` §2.
- [ ] **S1-03** · L · `fulfilCheckoutSession()` in `lib/server/billing/fulfil.ts`: single transactional, idempotent, stacking fulfilment; keeps promo/free-code logic (`lookupPromo`, `resolveAccessDays`); writes new payment fields (`status`, `grantedMs`, `expiresAtAfter`, `paymentIntentId`, `fulfilledBy`, `livemode`).
  - Depends: S1-02
  - Files: `lib/server/billing/fulfil.ts`, `lib/stripe/activate.ts` (to retire), `lib/firestore/types.ts`
  - Done when: emulator tests cover new, renewal, upgrade, replay, concurrent calls, free code, unresolvable user.
  - Refs: PAY-2, PAY-3
- [ ] **S1-04** · M · Webhook uses `fulfilCheckoutSession` for `checkout.session.completed` and `async_payment_succeeded`, behind `BILLING_FULFIL_V2`; signature handling unchanged.
  - Depends: S1-03
  - Files: `app/api/stripe/webhook/route.ts`
  - Done when: signed-fixture route tests pass with the flag on and off.
- [ ] **S1-05** · M · `/api/stripe/verify` uses `fulfilCheckoutSession`; ownership check kept; returns explicit state (`paid` / `pending` / `failed`) and the new `expiresAt`; thank-you page polling updated.
  - Depends: S1-03
  - Files: `app/api/stripe/verify/route.ts`, `app/thank-you/page.tsx`
  - Done when: verify + webhook racing on one session results in exactly one fulfilment.
- [ ] **S1-06** · M · Checkout route creates sessions only: remove the `sessions.list` reconciliation and `alreadyPaid`; add Stripe idempotency key, `client_reference_id`, richer metadata (`uid`, `planId`, `interval`, `env`); allow already-active users to buy.
  - Depends: S1-03
  - Files: `app/api/stripe/checkout/route.ts`
  - Done when: a lapsed monthly customer who bought the same plan before gets a new Checkout URL (PAY-1 test passes).
  - Refs: PAY-1, PAY-3
- [ ] **S1-07** · S · Remove the hard-coded legacy `$99` path: seed a default "Annual" plan (script), require `planId`, make the landing fallback card read the seeded plan.
  - Files: `app/api/stripe/checkout/route.ts`, `scripts/migrations/seed-default-plan.ts`, `app/subscribe/page.tsx`, `app/page.tsx` (fallback)
  - Done when: no `9900` literal remains; subscribe works with the seeded plan.
- [ ] **S1-08** · M · Subscribe page for active users: show current expiry and "Renewing extends your access to <date>"; replace the `alreadyPaid` redirect; clear error and pending states.
  - Depends: S1-06
  - Files: `app/subscribe/page.tsx`, `lib/i18n` (6 languages)
  - Done when: copy reviewed in all six languages; renewal flow works end to end in staging.
- [ ] **S1-09** · S · Admin `assign_plan` and `grant_year` use the same `computeExpiry`; tests.
  - Depends: S1-02
  - Files: `lib/plans.ts`, `app/api/admin/subscription/route.ts`
  - Done when: customer path and admin path give identical results for the same inputs.
- [ ] **S1-10** · S · `getStripe()` throws a clear error at request time when `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is missing; refuse a live key when `APP_ENV` is not `production`; build still succeeds without keys.
  - Files: `lib/server/billing/stripe.ts` (replaces `lib/stripe/server.ts`)
  - Done when: route tests prove the failure mode; `next build` passes with no Stripe env.
  - Refs: PAY-5
- [ ] **S1-11** · M · Stripe test-mode scenario run and evidence: new purchase, renewal after expiry, early renewal, monthly→yearly upgrade, double click, replayed webhook, verify/webhook race, 100 %-off code. Save event ids and results.
  - Depends: S1-03 … S1-08
  - Files: `docs/upgrade/evidence/S1.md`, `scripts/e2e/stripe-scenarios.ts`
  - Done when: all scenarios pass in staging and are recorded.
- [ ] **S1-12** · S · Retire `activateSubscription` after parity (keep `resolveUidForSession` logic inside `fulfil`); remove dead code. Schedule deletion of the old path one week after production rollout.
  - Depends: S1-11
  - Done when: no imports of `lib/stripe/activate.ts`; lint/type/tests green.

## Risks and notes

- The webhook is the only thing that can double-grant; the `payments` document is the idempotency key, so test concurrency explicitly.
- Do not change plan lengths (monthly 30 d, yearly 365 d).
- Production still runs the old path until the R1 gate (S2-11).
