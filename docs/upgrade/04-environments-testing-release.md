# 04 · Environments, testing and release

## Environments

| Env | Hosting | Firebase | Stripe | Sentry | Notes |
|---|---|---|---|---|---|
| **local** | `next dev` | Firebase **emulators** (Auth + Firestore) | test keys + Stripe CLI forwarding | off | default for unit/emulator tests |
| **staging** | Vercel preview/branch deployment | **separate Firebase project** | **test mode** keys, own webhook endpoint | on (`environment=staging`) | every payment change is proven here first |
| **production** | Vercel production | production project | live keys | on (`environment=production`) | live keys never used in staging or tests |

**Hard rule:** no live Stripe key outside production. Staging and local must use `sk_test_…` and a
distinct webhook secret per endpoint (the code fails loudly if a live key is used with `NODE_ENV!=="production"`: S1-10).

## Environment variables (additions)

Existing variables are in `.env.example`. Add (all server-side unless noted):

| Variable | Purpose | Sprint |
|---|---|---|
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | error monitoring, source maps | S0 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | shared rate limiter | S3 |
| `CRON_SECRET` | authorises `/api/cron/*` calls from Vercel Cron | S2 |
| `MEDIA_SIGNING_SECRET` (optional; else derived from `GALLERY_JWT_SECRET` via HKDF) | signs photo URLs | S3 |
| `APP_ENV` (`local`, `staging` or `production`) | tags Stripe metadata; refuses live Stripe keys outside production | S1 |
| `BILLING_FULFIL_V2` (`0`/`1`) | switches webhook + verify to the new fulfilment path; removed in S2-12 | S1 |
| `MEDIA_PROTECTED_TIER` (`0`/`1`) | enables opaque-token delivery for protected galleries (D15) | S3 |
| `FIREBASE_EMULATOR_HOST` etc. | tests | S0 |

## Test strategy

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | `access.ts`, money, pricing, token signing, rate-limit logic, i18n key parity |
| Emulator | Vitest + Firebase emulators | `fulfilCheckoutSession`, event handlers, repos, cascade deletes, Firestore **rules** (`@firebase/rules-unit-testing`) |
| Route | Vitest (call handlers with `Request`) | webhook (signed fixtures via `stripe.webhooks.generateTestHeaderString`), verify, checkout, proxy/media, verify-password lockout |
| Stripe test-mode E2E | script + Stripe CLI (+ Playwright for the hosted page, nightly) | new purchase, renewal after expiry, early renewal/upgrade, double click, replay, refund, dispute, async failure |
| Visual / UI | `/dev/ui` kitchen-sink page + screenshot review; Lighthouse for landing | design system and landing acceptance |

**Rule for payments:** write the failing test (reproducing the audit finding) first, then fix. Evidence
of each Stripe test-mode scenario is saved in `docs/upgrade/evidence/<sprint>.md` (date, scenario,
Stripe event ids, result).

## Running the tests locally

```bash
npm test            # unit + route tests (no external services)
npm run test:emu    # emulator suite: starts Auth + Firestore emulators, runs tests/emu, shuts down (needs Java 11+)
npm run emu         # start the emulators for manual work
```

Fixtures and builders live in `tests/helpers/stripe.ts` (`sessionFixture`, `eventFixture`,
`signedWebhookRequest`). To exercise a real endpoint with Stripe test mode, forward events with the
Stripe CLI and use the secret it prints:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook   # prints a whsec_… for STRIPE_WEBHOOK_SECRET
stripe trigger checkout.session.completed
```

## CI (S0-05)

GitHub Actions on every PR and push to `main`: `npm ci` → `npm run lint` → `npm run typecheck` →
`npm test` (emulator suite via `firebase emulators:exec`) → `npm run build`. Mark the workflow as a
**required check** once green. Node ≥ 20.9.

## Working agreements

1. Work happens on branches named `sprint-N/<short-task-name>`; one PR per task (or per small group).
2. **Update the task checkbox in the same PR** as the code (see `README.md` for the status script).
3. Commit/PR titles start with the task id: `S1-03: add fulfilCheckoutSession`.
4. Before opening a PR: `npm run lint && npm run typecheck && npm test`.
5. Payment code: test first, staging next, production last. Never paste live keys into chat, issues or logs.
6. Read the Next 16 docs in `node_modules/next/dist/docs/` before using routing, caching, metadata or request-interception APIs (see `AGENTS.md`).
7. Decisions: record in `00-proposal-traceability-and-decisions.md` and reference the id (`D3`) in the PR.
8. Anything that changes user data (migrations, back-fill) ships as a **dry-run script first**; the owner approves the output before `--apply`.

## Release gates

Each phase ends with a gate. A gate is a checklist in the last task of the phase; it is not
done until evidence is committed under `docs/upgrade/evidence/`.

| Gate | After | Must be true |
|---|---|---|
| **R1** (S2-11) | Phase 1 | All S1/S2 scenarios pass in staging; CI green; Sentry receiving staging events; webhook endpoint in Stripe dashboard subscribes to the new event types; back-fill report reviewed; rollback noted |
| **R2** (S4-09) | Phase 2 | Security tests pass; rate limiter provisioned in production; dynamic payment methods and invoice settings enabled in the Stripe dashboard; CSP in report-only for ≥ 3 days without violations |
| **R3** (S8-06) | Phase 3 | Landing sign-off (visual, Lighthouse, six languages); admin permissions matrix passes; old admin removed; stats counters verified against a full recompute |
| **R4** (S10-05) | Phase 4 | Features covered by tests; reminders sent to a test account on a fake clock; D3 behaviour verified |
| **Final** (S11) | all | regression checklist, live-mode rehearsal, 72 h monitoring |

### Rollout of the payment rewrite (R1 detail)

1. Deploy to staging; run every scenario with Stripe test mode and the Stripe CLI.
2. Ship to production behind `BILLING_FULFIL_V2` (webhook + verify use the new path; old path stays in code, off). Flip on, watch Sentry and `stripe_events` for 24 h.
3. Keep the old path for one week, then delete it (S1-12 follow-up).
4. Run the back-fill report **against production, read-only**; the owner reviews; apply only approved rows.

### Rollback

Payment rewrite: set `BILLING_FULFIL_V2=0` (old path resumes; `payments` records already written remain valid). Any data migration has a documented reverse or a backup export taken before `--apply`.

## Runbook topics (written in S11-04, tracked in `docs/runbook.md`)

Refund a customer · re-sync a payment from a Checkout session id · run/approve the back-fill ·
add/remove an admin · rotate `STRIPE_WEBHOOK_SECRET`, `GALLERY_JWT_SECRET`, `MEDIA_SIGNING_SECRET` ·
read Sentry alerts · what to do when the reconcile cron reports missing payments.
