# 01 · Audit findings

Static audit of `aisaaslab/photodrive` at commit `d589167` (main, 24 Nov 2026).
Method: reading the code. **Not yet compared against live Stripe, Sentry or Firestore
data.** Sprint S0/S1/S2 each start by reproducing the relevant finding in test mode or
against staging data, so nothing below is acted on as a fact until it is proven.

Severity: **H** = costs users money, lets data leak or blocks a core flow ·
**M** = reliability, abuse, or scaling risk · **L** = hygiene.

> ID mapping to the chat audit: P1–P6 → `PAY-1`–`PAY-6`, S1–S6 → `SEC-1`–`SEC-6`.
> New IDs found while writing this plan are marked **(new)**.

## Strengths to keep (do not regress)

- Firestore rules deny all client access except the user's own profile, and block
  client writes to subscription fields (`firestore.rules`).
- Gallery passwords: bcrypt hash for verification + AES-256-GCM sealed copy for the
  photographer reminder (`lib/gallery/password-vault.ts`).
- Stripe webhook verifies the signature; activation is transactional and keyed on
  `payments/{sessionId}`.
- Paywall for creating galleries is enforced server-side (`app/api/galleries/route.ts:25-33`).
- Drive folder listings are cached for 60 s (`lib/drive/client.ts`).
- Per-route ownership checks on gallery mutations; TypeScript `strict` is on.

## Payments

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| **PAY-1** | H | **Returning customers cannot renew.** Checkout lists Stripe sessions for the same email + same plan in the last 365 days; if any is paid it calls `activateSubscription` (a no-op, because `payments/{sessionId}` already exists) and returns `alreadyPaid`. The subscribe page then redirects to Account. A monthly customer whose plan lapsed is stuck, still expired. | `app/api/stripe/checkout/route.ts:48-78`; `app/subscribe/page.tsx:101-104`; `lib/stripe/activate.ts:111-114` |
| **PAY-2** | H | **Paying while still active adds no time.** `expiresAt = currentlyActive ? currentExpires : now + grantedMs`. The payment is recorded, the plan label is overwritten, the expiry does not move. Admin "assign plan" stacks time, so the two paths disagree. | `lib/stripe/activate.ts:118-122`; `lib/plans.ts:108-110`; `app/api/admin/subscription/route.ts:44-50` |
| **PAY-3** | M | **Three activation entry points** (checkout reconcile, `/verify`, webhook) plus a Stripe `sessions.list` (max 100, no pagination) on every checkout: slow and hard to reason about. | `checkout`, `verify`, `webhook` routes |
| **PAY-4** | H | **Webhook gaps.** Only `checkout.session.completed` and `async_payment_succeeded` are handled. Refunds, disputes and async failures are ignored (a refunded customer keeps access). A paid session that cannot be matched to a user returns **200**, so Stripe never retries. No event log. | `app/api/stripe/webhook/route.ts:39-77` |
| **PAY-5** | M | **Weak configuration.** Missing `STRIPE_SECRET_KEY` silently becomes `sk_test_placeholder`. `payment_method_types: ["card"]` is pinned though the audience is NL/DE/IT/ES/EL. Checkout passes only `customer_email`, so `stripeCustomerId` is likely always empty (one-time `payment` mode creates no customer by default). No `invoice_creation`. Legacy hard-coded `$99` annual path (`unit_amount: 9900`) duplicated on the landing fallback card. | `lib/stripe/server.ts:7`; `checkout/route.ts:80-123`; `app/page.tsx:564-593` |
| **PAY-6** | M | **Currency hard-coded to "$".** Landing, subscribe, admin plans, admin user plan picker and `CreateUserModal` format with `$`; admin revenue sums USD only; Account page special-cases USD. | `app/page.tsx:64`; `app/subscribe/page.tsx:154`; `app/dashboard/admin/plans/page.tsx:10`; `app/dashboard/admin/users/page.tsx:464`; `components/admin/CreateUserModal.tsx:128`; `app/api/admin/stats/route.ts:55-69` |
| **PAY-7 (new)** | H | **Customers who paid but were not extended** (consequence of PAY-1/2, or of a webhook that never landed). Count unknown until the back-fill report runs. | see `03-target-architecture.md` §Back-fill |

## Security and reliability

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| **SEC-1** | H | **Photo delivery is not tied to a gallery, and the protection model is weaker than the proposal implies.** (a) `/api/photos/proxy` serves any Drive file id with the server's API key, ignores `allowDownload` and the gallery password for `size=full`, and sets public cache headers. (b) **Newly found:** the gallery page sends every visitor each photo's Drive `id` + `thumbnailLink`; thumbnails/previews load **directly from Google's CDN** (`driveImageUrl`), and single downloads go straight to `drive.usercontent.google.com` (`driveDownloadUrl`). The proxy is only the fallback. The Drive folder must be public by design (setup step 2). Net: the gallery password gates the *page*, not the files; `allowDownload=false` hides buttons but does not stop a visitor who has the ids. See decision **D15**. | `app/api/photos/proxy/route.ts`; `lib/drive/public-url.ts`; `app/gallery/[slug]/page.tsx:90-200`; `components/gallery/PhotoTile.tsx:70-90` |
| **SEC-2** | M | **Rate limiting does not work on serverless.** Contact and selection-submit use in-memory `Map`s (per instance, reset on cold start, never evicted). Gallery password verification has **no** limit. Demo limit counts *all-time* docs per IP (blocked forever after 3), demo docs are never deleted, and the IP comes from a spoofable header. | `app/api/contact/route.ts:8-27`; `app/api/galleries/[id]/selection/submit/route.ts:20-33`; `app/api/gallery/verify-password/route.ts`; `app/api/demo/create/route.ts:23-40` |
| **SEC-3** | M | **Basic hardening missing.** Gallery access cookie has no `Secure`; no security headers in `next.config.ts`; several handlers call `req.json()` unguarded (500 on bad body) and hand-roll validation. | `verify-password/route.ts:7,37-43`; `next.config.ts`; `demo/create/route.ts:11` |
| **SEC-4** | M | **Data left behind / reset.** `upsertUser` sets `createdAt: serverTimestamp()` on every call and `AuthProvider` calls it on every auth-state change, so the profile `createdAt` is reset constantly. Deleting a gallery or an account does not delete `gallery_selections` (client favourites, EU privacy relevance). | `lib/firestore/users.ts:17-21`; `components/auth/AuthProvider.tsx:53-60`; `app/api/galleries/[id]/route.ts:108-121`; `app/api/user/delete/route.ts` |
| **SEC-5** | M | **Admin does not scale / single admin.** Stats and users endpoints read *entire* `galleries`, `users`, `payments` collections on every load and cap at `listUsers(1000)` (silently drops users beyond that). Admin is one `ADMIN_UID` env value; no audit trail. | `app/api/admin/stats/route.ts:15-21`; `app/api/admin/users/route.ts:11-17`; `lib/firebase/admin-guard.ts:15-19` |
| **SEC-6** | M | **Public gallery ignores the owner's subscription.** Nothing under `app/gallery` reads subscription fields, so galleries stay live after expiry. This may be intended, and the landing page promises it (see D3). | `app/gallery/[slug]/page.tsx` |
| **SEC-7 (new)** | L | **Rules gap.** `locked()` omits `planId`, `planName`, `planInterval`, `subscriptionSource`, `promoCode`, so a user can write those fields on their own profile (cosmetic spoofing, but they are shown in admin). | `firestore.rules:19-21` |
| **SEC-8 (new)** | L | **Legacy plaintext passwords are migrated on read.** `GET /api/galleries` (and admin lists) write to Firestore while reading. Fine as a one-off, wrong as a permanent pattern. | `lib/gallery/password-vault.ts:71-84`; `app/api/galleries/route.ts:120-126` |
| **SEC-9 (new)** | L | **No `server-only` guards.** Modules documented as server-only (`password-vault`, `site-settings`, `email`) can still be imported from client code by mistake. | `lib/gallery/password-vault.ts:1`; `lib/site-settings.ts:1`; `lib/email.ts:1` |

## Structure and code health

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| **STR-1** | H | **No safety net.** ~17.2k lines of TS/TSX in `app/`, `components/`, `lib/`; no tests, no CI, no error monitoring; 16 `console.*` calls are the only record. `package.json` has no `test` or `typecheck` script. | repo root |
| **STR-2** | M | **Copy-pasted auth.** 9 route files re-implement bearer-token verification although `lib/firebase/admin-guard.ts` exists and 16 files already use it. | `user/delete`, `user/subscription`, `galleries` (+ `[id]`, `cover`, `photos`, `selection`), `stripe/checkout`, `stripe/verify` |
| **STR-3** | M | **No data layer; types drift.** 52 raw `collection("…")` calls across routes/libs. `GalleryDoc` lacks `passwordEnc`/`pwChangedAt`; `UserDoc` lacks `compGranted`, `subscriptionSource`, `promoCode`. Routes cast with `as unknown as GalleryDoc[]`. | `lib/firestore/types.ts`; `app/api/galleries/route.ts:127` |
| **STR-4** | M | **Very large components.** `GalleryCard` 959 lines, admin users page 765, `MasonryGrid` 677, `NewGalleryForm` 654, `Lightbox` 571, `CoverPickerModal` 475. | `components/…`, `app/dashboard/admin/users/page.tsx` |
| **STR-5** | M | **Landing is a 644-line client component** that fetches plans in `useEffect`: prices pop in after hydration, weaker SEO, whole page shipped as client JS. | `app/page.tsx:1,111-118` |
| **STR-6** | M | **i18n monolith.** One 1,990-line file with all six languages; imported (client-side) by 40 files. Language is stored in `localStorage` and applied after hydration, so the server cannot render the visitor's language. | `lib/i18n/index.tsx:12-1903,1938-1985` |
| **STR-7** | M | **Two design languages.** Dark aurora/glass UI (landing, dashboard) vs light token UI (`components/Hero.tsx`, `/lp/*`, `@theme` tokens). Class names mislead (`text-rose-gradient` is teal). | `app/globals.css`; `components/Hero.tsx`; `app/lp/*` |
| **STR-8** | L | **Hygiene.** Two zip libraries (`jszip` in `MasonryGrid`/`GalleryCard`, `client-zip` in the download route); dead `lib/firestore/favorites.ts` (client SDK, denied by rules, no importers); 26 files with a UTF-8 BOM; mojibake in 5 files (`globals.css`, `not-found.tsx`, `ImageCompareSlider.tsx`, `TrustSection.tsx`, `branding.ts`); brand/email defaults hard-coded (`photodrive.co` and the product's earlier name) in 6 files. | repo-wide |
| **STR-9 (new)** | M | **The dark mock-up omits existing conversion features.** Current landing also has `DemoForm` (paste a Drive link, get a 10-minute demo), `DemoVideo` (tutorial), `TrustSection` ("Why PhotoDrive") and a Drive↔gallery compare slider. See decision **D14**. | `app/page.tsx:320-445` |

## Stack facts a new session needs

- Next.js **16.2.1**, React 19.2, Tailwind v4, Firebase Auth + Firestore (Admin SDK on the
  server), Stripe SDK 20, `jose`, `bcryptjs`, `nodemailer`/Resend, SWR, Vercel Analytics.
- `AGENTS.md` warns Next 16 has breaking changes: read `node_modules/next/dist/docs/`
  **before** touching routing, caching (`unstable_cache` / `revalidateTag(tag, {expire})`
  are already in use), middleware/proxy or metadata APIs.
- Hosting is Vercel-style (analytics package, README deploy steps). Cron and rate-limit
  infrastructure choices assume Vercel; see D6/D7.
- Default UI language is English with browser detection; Greek is a first-class
  language; the six languages are `el en nl de es it`.
