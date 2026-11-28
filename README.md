# PhotoDrive

**Turn any Google Drive folder into a private, professional photo gallery for your clients.**

PhotoDrive is a subscription web app for photographers, studios and event shooters. The photographer pastes a Google Drive folder link and gets a shareable gallery. The client opens the link with no account and no signup, browses full screen, marks favourites and downloads. The photographer sees exactly which photos were chosen.

**The photos never leave the photographer's own Google Drive.** There is no re-upload, no storage bill and no third party holding the client's files: images are served from Google, or through the app's own protected delivery for private galleries.

> **White-label.** "PhotoDrive" is the default product name. To ship under your own brand, set `NEXT_PUBLIC_APP_NAME` (page titles, header, social preview) and do the one-time project-wide find and replace described in [Step 14 of the setup guide](docs/SETUP-GUIDE.md) for the marketing copy.

---

## What it does

**For photographers**

- **Galleries from a Drive folder**, public or password-protected, with a cover photo, title font and colour, event date and location, their own name, avatar and links. A live check tells them while creating a gallery whether the folder is shared correctly and how many photos it holds.
- **Client favourites and "Send selection".** The client taps the heart and sends the list. The photographer sees it in the dashboard, copies the file names (with or without extensions, ready for Lightroom's text filter) or downloads a CSV, and can switch downloads off automatically once a selection arrives.
- **Simple statistics** per gallery: views, downloads, favourites, last visit. Counts only; the app never records who visited.
- **Optional expiry date** for any gallery, extendable from the dashboard.
- **Billing page** with the plan, renewal date, payment history with invoices, and a clear message if the plan has lapsed.
- **Renewal reminders and a grace period**: e-mails before a plan ends, then 14 days of grace; after that galleries show a polite "unavailable" page. Nothing is deleted, and renewing restores everything at once. (Both ship switched off.)
- **Six languages** (English, Greek, Dutch, German, Spanish, Italian), phone to desktop layouts, keyboard and screen-reader friendly.

**For the owner (admin back office, `/dashboard/admin`)**

- **Overview** with the key numbers and a live "needs attention" count.
- **Payments**: totals per currency, refunds and disputes, a review queue you resolve in place, a "re-sync this payment" action.
- **Support inbox** for the contact form: open, unread, resolved, with notes and a link to the sender's account.
- **Plans** in 13 currencies with a live preview of the pricing section, and **promo codes** that grant free access.
- **Users** and **Galleries** with search, filters and every change written to an audit trail.
- **Settings** for the support address and tracking IDs (Google Tag Manager, Google Ads, Meta Pixel).
- Optional **error monitoring** with Sentry.

---

## Tech stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, server components, route handlers), React 19, TypeScript |
| Styling | Tailwind CSS v4 on design tokens; Manrope, self-hosted |
| Data and auth | Firebase Auth and Firestore (Admin SDK on the server only) |
| Photos | Google Drive API, read-only |
| Payments | Stripe Checkout and webhooks (one-time payments, no auto-renewal) |
| Rate limits | Upstash Redis (optional but recommended in production) |
| E-mail | SMTP or Resend |
| Monitoring | Sentry (off until a DSN is set) |
| Tests | Vitest, the Firebase emulators, Playwright-driven browser checks |
| Hosting | Vercel (scheduled jobs in `vercel.json`) |

---

## Quick start (developers)

Requires Node.js 22.12 or newer (the Firebase Admin SDK 14 and Vitest 5 need 22+). On Vercel, the `engines` field in `package.json` selects it.

```bash
cp .env.example .env.local   # then fill in your keys
npm install
npm run dev                  # http://localhost:3000
```

The app builds and runs with an empty `.env.local`, so you can look around first. Anything that talks to Firebase, Google Drive or Stripe needs real credentials. Never commit `.env.local`.

To run against local emulators instead of a real Firebase project (no credentials, nothing leaves your machine):

```bash
npm run emu                  # Firebase Auth + Firestore emulators
```

Then follow [`scripts/verify/browser/README.md`](scripts/verify/browser/README.md) to seed them and serve a production build.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Develop, build, serve the production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint (CI allows at most 11 warnings) |
| `npm test` | Unit tests |
| `npm run test:emu` | Tests that need the Firebase emulators (starts and stops them) |
| `npm run i18n:check` | All six languages have the same keys |

---

## Configuration

Everything is configured with environment variables; [`.env.example`](.env.example) documents each one. The ones you need first:

| Group | Variables |
|---|---|
| Firebase (browser) | `NEXT_PUBLIC_FIREBASE_*` |
| Firebase Admin (server only) | `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` |
| Google Drive | `GOOGLE_DRIVE_API_KEY` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| App | `NEXT_PUBLIC_APP_URL`, `APP_URL`, `NEXT_PUBLIC_APP_NAME`, `ADMIN_UID`, `GALLERY_JWT_SECRET`, `CRON_SECRET` |
| Production extras | `APP_ENV`, `UPSTASH_REDIS_REST_URL` / `_TOKEN`, `ADMIN_ALERT_EMAIL`, SMTP settings |

**Feature flags**, all off by default so a fresh deploy behaves like the previous version:

| Flag | Turns on |
|---|---|
| `BILLING_FULFIL_V2` | The newer payment fulfilment path (early renewal while active) |
| `MEDIA_PROTECTED_TIER` | Opaque, signed photo links for private galleries |
| `GALLERY_LAPSE_ENFORCE` | The 14-day grace and the "unavailable" page after a plan ends |
| `REMINDERS_MODE` | `off`, `dry-run` (log who would get what) or `send` |

A live Stripe key is refused unless `APP_ENV=production`, so a staging deploy can never charge real cards.

**Scheduled jobs** (`vercel.json`, protected by `CRON_SECRET`): payment reconciliation, the review digest, cleanup, statistics recompute, renewal reminders.

---

## Project layout

```
app/            Pages and API routes (App Router); app/api/admin/* is the admin API
components/     UI: components/ui (design-system primitives), dashboard, gallery, admin
lib/            Server code (lib/server), shared pure rules (lib/shared), i18n, Drive, billing
scripts/        i18n check, operations scripts, browser verification (scripts/verify/browser)
tests/          Unit and emulator tests
docs/           Setup guide, security model, and the upgrade plan (docs/upgrade)
firestore.rules Database security rules: publish them, do not skip this
```

Pure business rules (money, availability after a lapse, reminders, validation) live in `lib/shared` and `lib/gallery` with unit tests; server routes wrap them with authentication, validation and the audit log.

---

## Testing and quality

Each change runs types, lint, unit tests, the emulator suite, a production build and language parity in CI (`.github/workflows/ci.yml`). User-facing changes are also checked in a real browser against the emulators: real login, accessibility (axe, WCAG 2.1 A/AA), 390 px layouts, keyboard walkthroughs, and behaviour snapshots that must not change unless the change meant it. The checks and how to run them are listed in [`scripts/verify/browser/README.md`](scripts/verify/browser/README.md).

Security notes (rate limits, protected photo delivery, the Firestore rules, headers and the Content-Security-Policy) are in [`docs/security-model.md`](docs/security-model.md).

---

## Deploying

The step-by-step guide for someone who has never deployed a website, from installing Node.js to a live domain taking payments, is [`docs/SETUP-GUIDE.md`](docs/SETUP-GUIDE.md). It also contains a prompt that lets an AI coding assistant do most of the setup (also on its own in [`INSTALL-PROMPT.md`](INSTALL-PROMPT.md)), the cost estimate, troubleshooting and an FAQ.

In short: create a Firebase project, a Drive API key and a Stripe account; put the variables in Vercel; add the Stripe webhook; make yourself admin with `ADMIN_UID`; publish `firestore.rules`; test with Stripe test keys before switching to live.

---

## Project status and documentation

The project went through a planned upgrade (payments fixes, security hardening, a new design system, the admin back office, billing lifecycle, engagement features, Sentry). The plan, decisions, evidence and what is left are in [`docs/upgrade/`](docs/upgrade/): start with [`HANDOFF.md`](docs/upgrade/HANDOFF.md) and [`REMAINING-WORK.md`](docs/upgrade/REMAINING-WORK.md).

Working with an AI coding assistant on this repository? Read [`AGENTS.md`](AGENTS.md) first: Next.js 16 has breaking changes, and the version's own documentation is in `node_modules/next/dist/docs/`.
