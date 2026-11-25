# S0 — Environments and safety net

**Phase:** 1 · Payments and safety net
**Goal:** Be able to change payment code without fear: a staging environment, an automated test suite, CI on every change, and error monitoring, all in place *before* any behaviour changes.
**Entry:** Plan approved. Decision **D12** (environments) answered by the owner.
**Exit (done when):** CI is green on a pull request; `npm test` runs the emulator suite locally and in CI; a deliberate test error from staging appears in Sentry; a signed test webhook reaches the staging endpoint.
**Decisions needed:** D12 (blocking).

Legend: `[ ]` todo · `[~]` in progress · `[x]` done. Sizes: S ≈ ½ day, M ≈ 1–2 days, L ≈ 3+ days.

## Tasks

- [ ] **S0-01** · S · Owner provisions environments (D12): Firebase staging project, Stripe test keys + a staging webhook endpoint, Sentry project, Vercel preview env vars.
  - Done when: the checklist in `04-environments-testing-release.md` is complete; `.env.staging.example` committed (names only, no secrets).
  - Refs: G9
- [x] **S0-02** · M · Add Vitest and scripts: `typecheck` (`tsc --noEmit`), `test`, `test:watch`; path alias `@/`; first smoke test.
  - Files: `package.json`, `vitest.config.ts`, `tests/smoke.test.ts`
  - Done when: `npm test` and `npm run typecheck` pass locally.
- [x] **S0-03** · M · Firebase emulator setup (Auth + Firestore): config, `npm run emu`, `test:emu` via `firebase emulators:exec`, seed helpers (plans, users, payments).
  - Files: `firebase.json`, `tests/helpers/db.ts`, `tests/helpers/seed.ts`
  - Done when: a test writes and reads Firestore through the Admin SDK against the emulator.
- [x] **S0-04** · M · Stripe test harness: builders for signed webhook requests (`stripe.webhooks.generateTestHeaderString`), session fixtures (paid, `no_payment_required`, async pending), refund/dispute event fixtures; document Stripe CLI forwarding.
  - Files: `tests/helpers/stripe.ts`, `tests/fixtures/stripe/*.json`, `04-environments-testing-release.md`
  - Done when: a test posts a signed `checkout.session.completed` to the current webhook handler and gets 200.
- [~] **S0-05** · M · GitHub Actions CI: install, lint, typecheck, test (emulators), build; Node 20; dependency cache.
  - Files: `.github/workflows/ci.yml`
  - Done when: workflow green on a PR; set as a required check.
- [ ] **S0-06** · M · Sentry (`@sentry/nextjs`): client, server, edge init; source maps; environment tag; release = commit SHA; PII scrubbing; capture in API error paths.
  - Files: `sentry.*.config.ts`, `instrumentation.ts`, `next.config.ts`
  - Done when: a staging-only test route raises an error that shows up in Sentry with the release and environment.
  - Note: read the Next 16 docs for instrumentation and config wrapping first.
- [x] **S0-07** · S · Structured logger `lib/server/log.ts` (JSON, levels, request id); replace `console.*` in the three Stripe routes first.
  - Done when: Stripe routes log through the logger; no secrets or full emails in logs.
- [ ] **S0-08** · S · Baseline hygiene: confirm `npm run lint` passes (warnings policy documented), add `docs/upgrade/evidence/S0.md` with the environment checklist result and the first CI run link.
  - Done when: evidence file committed.

## Risks and notes

- Everything depends on D12; do not start S1 without staging Stripe test mode.
- Emulator tests need Java in CI (use `actions/setup-java`).
- Sentry must not capture request bodies for the Stripe and password routes.
