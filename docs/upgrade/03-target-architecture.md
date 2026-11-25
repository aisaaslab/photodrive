# 03 · Target architecture

Design decisions the sprints implement. Read `01-audit-findings.md` for the "why".
Principle: **small, testable, boring.** New code goes into the new structure; old code moves
only when a task touches it (no big-bang rewrite).

## 1 · Code structure

```
lib/
  shared/            # safe on client and server; pure functions, zod schemas
    money.ts         # formatMoney(cents, currency, locale), minor-unit handling
    pricing.ts       # buildTiers, discountPct (moved from app/page.tsx) + tests
    schemas/         # zod: gallery, plan, checkout, password, contact, demo…
  server/            # every file starts with: import "server-only"
    auth.ts          # requireUser(req), requireAdmin(req), getOptionalUser(req)
    http.ts          # route(handler, {auth, schema}): parse + auth + errors + Sentry + request id
    log.ts           # structured logger (replaces console.*)
    rate-limit.ts    # limit({key, limit, windowSec}) → Upstash or in-memory fallback
    media-token.ts   # signing/verification of photo URLs (see §3)
    audit.ts         # writeAudit({actor, action, target, before, after})
    repos/           # the ONLY place collection names live
      users.ts galleries.ts plans.ts payments.ts selections.ts
      stripeEvents.ts demos.ts stats.ts galleryStats.ts
    billing/
      access.ts      # computeExpiry / revokeGrant (pure)
      fulfil.ts      # fulfilCheckoutSession (transactional, idempotent)
      events/        # one handler per Stripe event type
      stripe.ts      # getStripe() (throws if key missing), customer helper
components/
  ui/                # design system primitives (Button, Pill, Card, Input, …)
  landing/ admin/ gallery/ dashboard/
app/api/cron/        # reconcile-payments, cleanup, reminders, stats-recompute
scripts/             # backfill/, migrations/ (never imported by the app)
tests/               # unit, emulator, e2e (see 04)
```

`lib/firebase/admin-guard.ts` and the 9 copy-pasted `getUid` helpers are replaced by
`lib/server/auth.ts`. `lib/stripe/*` is replaced by `lib/server/billing/*`.

**Route contract.** Every API route is `export const POST = route({ auth: "user", schema, handler })`.
`route()` returns JSON errors with stable codes, captures unexpected errors to Sentry, attaches a
request id, and never throws a bare 500 for bad input (400 with field errors).

## 2 · Billing

### Access rules (pure, unit-tested)

```ts
// lib/server/billing/access.ts
const LIFETIME_FROM = 4_102_444_800_000; // ≥ 2100-01-01 treated as lifetime (existing sentinel is year 3000)
computeExpiry({ now, currentExpiresAt, grantedMs }) =>
  currentExpiresAt >= LIFETIME_FROM ? currentExpiresAt          // comp/lifetime never shortened
  : max(now, currentExpiresAt ?? 0) + grantedMs                  // stack from later of now/expiry
revokeGrant({ now, currentExpiresAt, grantedMs }) =>
  currentExpiresAt >= LIFETIME_FROM ? currentExpiresAt
  : max(now, currentExpiresAt - grantedMs)
```

Implemented in `lib/server/billing/access.ts` with two small refinements (both unit-tested): a zero/invalid
grant changes nothing, and `revokeGrant` never moves an already-expired account forward to `now`
(it returns the current expiry unchanged).

Monthly = 30 days, yearly = 365 days (unchanged). Free-code grants use `accessDays`
(existing `resolveAccessDays`). The admin "assign plan" and "grant year" actions call the same
`computeExpiry`.

### One fulfilment path

`fulfilCheckoutSession(sessionOrId, { source })`, `source ∈ webhook | verify | reconcile | admin | backfill`.

1. Retrieve the session from Stripe if only an id is given (expand promo details for $0 sessions).
2. Return `{state:"pending"}` unless `payment_status` is `paid` or `no_payment_required`.
3. Resolve `uid` (metadata → `client_reference_id` → customer email lookup). Unresolvable → throw `UnmatchedPayment`.
4. Firestore transaction: if `payments/{sessionId}.status` is already fulfilled → no-op (replay). Else compute new expiry with `computeExpiry`, write user fields (`subscriptionStatus`, `subscriptionExpiresAt`, plan snapshot, `stripeCustomerId`) and the payment record.
5. Idempotency key is the payment document, so webhook, verify and reconcile can race safely.

`checkout` creates sessions only. It does **not** look up Stripe history and does **not** return
`alreadyPaid`. A user who is already active may buy again; the UI says "extends your access to <date>".
Double clicks are absorbed by a Stripe idempotency key `checkout:{uid}:{planId}:{minuteBucket}`.

### Checkout session parameters (S4)

- `client_reference_id: uid`, `metadata: {uid, planId, interval, env}`.
- `customer: <stripeCustomerId>` (created once per user and stored; replaces `customer_email`).
- `invoice_creation: { enabled: true }` with plan name in the line item and invoice metadata.
- No `payment_method_types`: use dynamic payment methods managed in the Stripe dashboard (card + wallets; iDEAL, SEPA, Bancontact, Klarna as enabled). Delayed methods are covered by `checkout.session.async_payment_succeeded/failed`.
- Keep inline `price_data` (no Stripe Product catalogue; not in the proposal).
- Legacy "no plan" path removed: a default "Annual" plan is seeded instead (S1-07).
- `getStripe()` throws a clear error at request time if `STRIPE_SECRET_KEY` is missing; `next build` still succeeds.

### Stripe events

Webhook flow: verify signature → create-if-absent `stripe_events/{event.id}` → dispatch → mark
processed. Already-processed events return 200. Handler errors return 500 so Stripe retries.

| Event | Action |
|---|---|
| `checkout.session.completed`, `…async_payment_succeeded` | `fulfilCheckoutSession` |
| `checkout.session.async_payment_failed`, `…expired` | record; no access change; failed async payment → customer e-mail (S2-14); expired = abandoned cart, no e-mail |
| `charge.refunded` | full refund → `revokeGrant` for that payment's `grantedMs`, `payments.status="refunded"`; partial → `partially_refunded`, flag `needs_review` (D5) |
| `charge.dispute.created` | suspend that payment's grant (`status="disputed"`), flag `needs_review` |
| `charge.dispute.closed` | won → restore grant; lost → revoke permanently (D5) |
| anything else | recorded as `ignored` |

### Notifications (D17)

| Who | Channel | When | Task |
|---|---|---|---|
| Operator | immediate e-mail to `ADMIN_ALERT_EMAIL` + log line | once, when an event ends in `needs_review` | S2-03 |
| Operator | Sentry alert; daily digest of open items; Overview counts | same triggers / daily | S2-16, S8-04 |
| Customer | e-mail in their stored language | refund (full/partial), dispute opened/won/lost, async payment failed | S2-14 (needs S2-13: `users.language`) |
| Customer | Account page status + dashboard banner | whenever a payment is refunded/disputed | S2-15 |

All notifications are best-effort side effects: a failure is logged and never changes the webhook response; each is sent
once per event (dedupe marker on the event / payment document); content never includes card data or other users' data.
Stripe's own refund receipt e-mails stay on; ours explain the effect on access.

**Unmatched payments:** if the user cannot be resolved and the event is < 24 h old, return 500
(Stripe retries with back-off); after 24 h store `needs_review`, return 200, alert in Sentry and
show in Admin → Payments → Needs attention.

**Reconciliation cron** (`/api/cron/reconcile-payments`, hourly): list paid Checkout sessions
from the last 48 h; any without a `payments` doc is fulfilled and counted. Alerts if > 0 repeatedly
(it means the webhook is failing).

### Data model changes

| Collection | Change |
|---|---|
| `users/{uid}` | `createdAt` set **once**; `stripeCustomerId`; `remindersSent` keyed by expiry; `emailLower` for admin search |
| `payments/{sessionId}` | + `status`, `paymentIntentId`, `chargeId`, `grantedMs`, `expiresAtAfter`, `refundedAmount`, `invoiceId`, `fulfilledBy`, `livemode` |
| `stripe_events/{eventId}` (new) | `type`, `livemode`, `receivedAt`, `processedAt`, `status` (`processed`\|`ignored`\|`needs_review`\|`failed`), `sessionId?`, `uid?`, `error?` |
| `audit_log/{id}` (new) | `at`, `actorUid`, `action`, `targetType`, `targetId`, `before?`, `after?`, `note?` |
| `stats/overview` (new) | counters: users, activeSubs, galleries, `revenueByCurrency{}`, payments; `updatedAt`, `recomputedAt` |
| `gallery_stats/{galleryId}` (new) | `views`, `downloads`, `lastViewAt`; `days/{yyyymmdd}` buckets (30 d) |
| `galleries/{id}` | + `disabled?`, `expiresAt?`, `disableDownloadAfterSubmit?` |
| `demo_galleries/{id}` | + `expiresAtTs` (Firestore Timestamp, for a TTL policy) |
| Firebase Auth | custom claim `admin: true`; `ADMIN_UID` stays as the bootstrap admin |

Update `firestore.indexes.json` for: `payments(uid, activatedAt)`, `stripe_events(receivedAt)`,
`galleries(createdAt)`, `users(emailLower)`. Update `firestore.rules` `locked()` to include
`planId, planName, planInterval, subscriptionSource, promoCode, stripeCustomerId, remindersSent`.

### Back-fill (S2-06 … S2-08)

Read-only first, applied only with explicit approval.

- **Report A (replay):** for each user, replay `payments` ordered by `activatedAt` with the *new*
  stacking rule; compare the resulting expiry with `users.subscriptionExpiresAt`. Skip comped/lifetime
  accounts; flag differences > 1 day. Columns: uid, email, payments replayed, expected expiry, current expiry, delta days, plan. The report adds `category` (`under_extended` | `over_extended`), `bothExpired` and `note`; over-extended accounts are review-only, the apply step never reduces access.
- **Report B (missing):** paid Stripe sessions (last 13 months) with no `payments` doc.
- Output CSV to `scripts/backfill/out/` (git-ignored). The owner marks rows approved in a copy;
  `--apply --approved approved.csv` is idempotent, transactional, writes an `audit_log` entry per
  user, and refuses to run without the file. Rehearse on staging fixtures first.

## 3 · Photo delivery (decision D15)

Facts that constrain the design (see SEC-1): Drive folders are public by design; today every visitor
receives Drive file ids and `thumbnailLink`s; thumbnails/previews come from Google's CDN and
single downloads from `drive.usercontent.google.com`.

**Tiered model (recommended):**

| Gallery type | Delivery |
|---|---|
| Public (no password), downloads allowed | Unchanged (CDN delivery). Proxy hardened. |
| Password-protected **or** downloads disabled | **Opaque photo tokens** (`HMAC(secret, galleryId:fileId)`), no Drive ids or URLs in the client payload. Images and originals served only through `/api/g/{galleryId}/media/{token}` with signed, bucket-expiring URLs. |

Signed URL: `…/media/{token}?size=thumb|preview|full&e={expiryBucket}&s={sig}` where
`sig = HMAC(g|token|size|e)` and `e` is rounded to a 6-hour bucket, so URLs are stable within a bucket
(cache-friendly) yet expire.

Server checks per request: gallery exists and is not `disabled`/expired · token resolves to a file in
the gallery's cached folder listing (membership) · gallery cookie valid when password-protected ·
`size=full` only if `allowDownload !== false` (and not locked by `disableDownloadAfterSubmit`) ·
signature + expiry · rate limit. Cache: `public` for public galleries, `private, max-age=…` for protected.
Range requests stay supported for video.

**Limits to state in docs/FAQ:** the Drive folder itself stays public, so anyone who obtains the folder link
can reach the files outside PhotoDrive. The token model protects against bypassing the gallery, not
against a leaked folder link.

Open cost question (S3-11): proxying protected galleries moves thumbnail bandwidth onto the app's
hosting; measure before enabling by default.

## 4 · Rate limiting and abuse

`lib/server/rate-limit.ts` (Upstash Redis; in-memory fallback in dev/tests). Keys use a hashed IP.

| Surface | Limit |
|---|---|
| gallery password verify | 5 failures / 10 min per IP+gallery → 15 min lockout, generic error |
| contact form | 5 / 10 min per IP |
| selection submit | 5 / 10 min per IP+gallery |
| demo create | 3 / 24 h per IP (rolling) + TTL cleanup of demo docs |
| photo proxy / media | 120 / min per IP |
| checkout create | 10 / 10 min per uid |

## 5 · Admin back office

- Routes stay under `/dashboard/admin` but the pages are rebuilt; the old ones are removed in S8-05.
- **Roles:** Firebase custom claim `admin`; `requireAdmin` accepts claim or `ADMIN_UID`.
- **Audit:** every admin mutation writes `audit_log` through `writeAudit`.
- **Lists are server-paginated** (`limit`, `cursor`, `q`); no endpoint reads a whole collection.
- **Overview** reads `stats/overview`; incremental updates on user/gallery/payment events plus a nightly recompute cron as the source of truth.
- Screens: Overview · Users (+ detail drawer) · Galleries · Payments (+ Needs attention, Stripe events) · Support · Plans & promo codes · Settings.

## 6 · Language and rendering

- Language preference moves to a `lang` cookie (read on the server) with browser detection on first
  visit; `LanguageProvider` receives the initial language from the server to avoid a flash (D16).
- i18n split into `lib/i18n/{el,en,nl,de,es,it}.ts`; types derived from `en`; only the active
  language is shipped; `npm run i18n:check` fails on missing keys.
- Landing page is a server component; interactive parts (nav, toggle, demo form, FAQ if needed) are small client islands.
- Before implementing caching or request-interception features, read the Next 16 docs in
  `node_modules/next/dist/docs/` (the code already uses `unstable_cache` and `revalidateTag(tag, {expire})`; check whether `use cache` / `cacheTag` are the current approach).

## 7 · Observability

Sentry (`@sentry/nextjs`) on client, server and edge; release = commit SHA; tags `route`, `uid` (hashed),
`stripe_event`. Alerts: webhook 5xx, `UnmatchedPayment`, reconcile found > 0, fulfil failure, cron failure.
Structured JSON logs through `lib/server/log.ts`. A short runbook (`docs/runbook.md`, S11-04) covers
refunds, re-syncing a payment, running the back-fill, rotating secrets.
