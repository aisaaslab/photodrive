# Remaining work: what is left of the PhotoDrive upgrade (2026-11-27)

Companion to [`HANDOFF.md`](HANDOFF.md). It splits the **54 open tasks** (60 of 114 are done) by *who can move them*, so it is clear what
is being built now and what is waiting for the owner. The landing-page review (S6-02/03/10/12/14) is **parked by the owner's decision**.

Owner decisions of 2026-11-27 (new):
- **Pricing section is fully dynamic** from the admin plans: monthly only → monthly cards; yearly present → annual card with the saving
  percentage against its monthly price; both → toggle. A lone monthly + lone yearly plan pair whatever they are called. (Done.)
- **Gallery settings**: the Drive folder link keeps showing after Save, no reload needed. (Done.)

---

## Progress log

- 2026-11-27: S10-01 selection export, S10-03 Drive folder check, S9-06 download lock after a selection is sent, S10-02 gallery stats,
  S9-01 D3 recorded (14 days), **S9-05 gallery expiry date and S9-04 availability after plan lapse** are done (see `evidence/S9.md`, `evidence/S10.md`).
  Lapse enforcement ships **off** (`GALLERY_LAPSE_ENFORCE=0`) until the owner switches it on.
- 2026-11-27: **S9-03 renewal reminder e-mails** done, shipped off (`REMINDERS_MODE=off`) with a dry-run mode for the owner to review (see `evidence/S9.md`).
- 2026-11-27: **S9-02 billing page** done (all plan states, truthful lapse wording, shared payment list) and **English dates are US** everywhere (owner decision).
- 2026-11-27: **S9-07 public copy** written (Terms section 7, three FAQ answers, six languages); waiting for the owner's review of the wording (checkbox stays `[~]` until then). The old landing's `TrustSection` card is left for S6-14.
- 2026-11-27: **S8-01 admin Payments screen** done: totals per currency, needs-attention queue resolved in place (credit a customer, mark reviewed, re-sync), filters/search/drawer, every action audited (see `evidence/S8.md`).
- 2026-11-27: **S8-02 support inbox** done: open/unread/resolved with counts, search, account matched to the sender with links to the account and payments, reply link, internal note, every change audited (see `evidence/S8.md`). The back-office tab bar no longer wraps.
- 2026-11-27: **S8-03 plans and promo codes** done: plans in any of 13 currencies with exact minor-unit prices, live preview using the real landing pricing section, validation, cache expiry and audit on every save; promo codes restyled and validated (see `evidence/S8.md`). Lint cap lowered from 13 to 11.
- 2026-11-27: **S8-04 admin Overview and Settings** done: live needs-attention strip and tab badges, revenue per currency in the right units (yen fix), numbers' age + Refresh, Settings validated as you type, changes audited only when real (see `evidence/S8.md`).
- 2026-11-27: **S8-05 permission matrix** done: every admin route, found from the file system, is 401 for visitors, 403 for customers (database untouched) and open to the administrator; found and fixed a 500 when editing a gallery that does not exist. No old admin page or endpoint was left to remove (see `evidence/S8.md`).
- 2026-11-27: **S5-12 part 4**: dashboard cards/list switch and phone card actions with whole labels (see `evidence/S5.md`); S5-12 stays in progress for owner review of the remaining areas.
- 2026-11-27: **S5-12 part 5**: subscribe plan picker and thank-you progress steps (see `evidence/S5.md`).
- 2026-11-27: **S5-12 part 6**: client password gate (photographer identity, label, show/hide, announced errors); see `evidence/S5.md`.
- 2026-11-27: **S5-12 part 7**: Account / Billing payment rows say what each payment bought and until when; see `evidence/S5.md`.
- 2026-11-27: **S5-12 part 8**: client gallery hero and header (name in the header on scroll, View photos cue, skip link); see `evidence/S5.md`.
- 2026-11-27: **S5-12 part 9**: toasts (undo, dismiss, assertive errors), undo for deleting a gallery, branded error page; see `evidence/S5.md`.
- 2026-11-27: **S5-12 part 10**: final keyboard and phone pass (clear focus on all fields, focus return after menu dialogs, 24 px targets); every S5-12 item is done, the box stays `[~]` for the owner's screenshot review; see `evidence/S5.md`.
- 2026-11-27: **S0-06 Sentry wiring** built, inert until a DSN is set, proved end to end against a local stand-in (release, environment, privacy filter, browser and server); stays `[~]` until the owner's Sentry project shows the staging test error; see `evidence/S0.md`.
- 2026-11-27: **S10-04 polish** done except the native-speaker review of the strings (a review sheet is ready: `evidence/S10-strings-review.md`): help text, empty states and keyboard / screen-reader pass for the three features, README feature list; see `evidence/S10.md`.
- 2026-11-27: **Next.js upgraded 16.2.1 → 16.4.6** (security: the audit no longer lists `next`); see `evidence/S3.md`. 20 transitive advisories remain (firebase-admin, nodemailer, build tools), left for a deliberate change.
- Next: nothing left that can be built without the owner. See the sections below (decisions, owner actions, release gates).

### Before turning on lapse enforcement (`GALLERY_LAPSE_ENFORCE=1`)
1. S6-14 shipped (old landing and its "link stays live" card gone) or that card reworded.
2. Owner (and native speakers) reviewed the Terms and FAQ wording; legal read of the Terms.
3. `BILLING_FULFIL_V2=1` and `REMINDERS_MODE` on, so customers can renew early and are warned.
4. Existing customers told about the updated Terms if the owner's policy requires it.

## A · Code work, can be built now (no owner input needed)

| Order | Task | What | Size |
|---|---|---|---|
| 1 | **S10-01** | Selection export: copy filenames / download CSV (Lightroom-style, with or without extension) | M |
| 2 | **S10-03** | Drive folder check (`POST /api/drive/check`) used live in the create form: accessible? how many photos? friendly errors | M |
| 3 | **S9-06** | "Switch off downloads once a selection is submitted", enforced server-side | M |
| 4 | **S10-02** | Gallery stats: views / downloads / favourites, no personal data, shown on the dashboard card | L |
| 5 | **S9-05** | Optional gallery expiry date, extend from the dashboard | M |
| 6 | **S8-01** | Admin payments screen + "re-sync this session" + needs-attention queue | L |
| 7 | **S8-02** | Admin support inbox | M |
| 8 | **S8-03** | Plans and promo codes restyle, live preview of the landing pricing card | M |
| 9 | **S8-04** | Admin overview and settings | M |
| 10 | **S8-05** | Remove old admin pages; permission-matrix test | M |
| 11 | **S5-12** | Rest of the user-area redesign (dashboard density, subscribe/thank-you, client gallery, toasts/errors, mobile pass) | L |
| 12 | **S0-06** | Sentry wiring (inert until a DSN is set) | M |
| 13 | **S10-04** | Polish: translations, accessibility, empty states, README feature list | S |

Each ships with tests, six-language strings, evidence in `evidence/`, and its checkbox in the same commit.

## B · Blocked on a decision from the owner

| Task | Decision needed |
|---|---|
| **S9-01** then **S9-02, S9-03, S9-04, S9-07** | **D3**: what happens when a plan lapses. Recommended: 14-day grace, then a polite "temporarily unavailable" page, nothing deleted, restored on renewal. Billing page, reminder e-mails, gallery availability and the landing/FAQ/Terms wording all follow from this. |
| S2-14 … S2-16 (finish) | **D17**: `ADMIN_ALERT_EMAIL`, SMTP credentials, wording review of customer e-mails |
| S6-01 | Confirm D2, D4, D11, D13, D14 in the log |

## C · Needs the owner to act (environment, accounts, production)

| Task | What the owner does |
|---|---|
| S0-01 | Staging Firebase project, Stripe test keys + staging webhook, Sentry project, Vercel preview env vars (D12) |
| S0-05 | Mark the CI `check` required on `main` |
| S1-11, S2-10 | Stripe test-mode scenario runs (code and scripts exist; needs test keys) |
| S2-07, S2-08 | Run the back-fill report against production (read-only), approve rows, then apply |
| S4-01, S4-04 | Production dry-runs: `restore-created-at`, `seal-legacy-passwords` |
| S4-05, S4-06, S4-07 | Stripe dashboard setup: customers/invoices, payment methods; verify in test mode |
| S3-08, S3-12, S3-13 | Review CSP report-only results; review the security-model text; verify public/private in staging |
| S3-11 | Measure Drive quota and bandwidth with real galleries (100 / 500 / 1,000 photos) |
| S1-08 | Verify the subscribe page for active users in test mode |
| Production config | `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `ADMIN_ALERT_EMAIL`, `APP_ENV`, Upstash and SMTP credentials; deploy `firestore.rules` and `firestore.indexes.json`; run the `emailLower` backfill |

## D · Release gates (after A, B and C)

`S2-11` (R1 payments to production, flag off→on) → `S2-12` (delete the old path a week later) → `S1-12` → `S4-09` (R2) →
`S8-06` (R3) → `S10-05` (R4) → `S11-01` … `S11-05` (regression in six languages, live-mode rehearsal with owner approval, cutover check,
monitoring + rollback drill, runbook, handover, tag `v2.0.0`).

## E · Parked by the owner

Landing page: S6-02, S6-03, S6-10, S6-12, S6-14 (review of `/new-landing`, then moving it to `/`).
Do **not** move the page to `/` until the owner signs off.

## F · Known small issues

- ~~English dates use `en-GB`~~ Decided and done 2026-11-27: English dates are US English everywhere (`LOCALES.en` = `en-US`).
- The old `TrustSection` has garbled Greek on the live landing page; it disappears with S6-14.
- The Drive folder field in the gallery settings dialog is read-only by design (lock icon and tooltip). Changing the folder of an
  existing gallery is not supported from the owner dialog; only the admin edit form can do it.
