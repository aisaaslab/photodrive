# 00 · Proposal traceability and decisions

Source: *PhotoDrive: Fix, redesign and grow*, proposal for Shun Younger by Olu,
**24 November 2026** (6 pages). This file maps every commitment in that PDF to the audit
and to sprint tasks, lists what the plan adds or changes, and holds the **decision log**.

**Selected landing direction: Concept B, "Cinematic Dark"** (Figma page *B · Cinematic Dark*).
See `02-landing-design-brief.md`.

## 1 · PDF commitment → audit → tasks

| # | PDF commitment (page) | Audit | Sprint tasks |
|---|---|---|---|
| 1 | Renewals always work (p3) | PAY-1 | S1-01, S1-03, S1-06, S1-08, S1-11 |
| 2 | Payments while active stack time; customer and admin paths follow the same rule (p3) | PAY-2 | S1-02, S1-03, S1-09 |
| 3 | One fulfilment routine, no slow lookup at checkout (p3) | PAY-3 | S1-03 … S1-06, S1-12, S2-12 |
| 4 | Refunds, disputes, failures update access; unmatched payments retried; every event logged (p3) | PAY-4 | S2-01 … S2-04, S2-09, S2-10 |
| 5 | Proper Stripe setup: fail on missing keys; one price source instead of a hard-coded legacy path (p3) | PAY-5 | S1-07, S1-10 |
| 6 | …local payment methods for NL, DE, IT, ES, EL (p3) | PAY-5 | S4-07 |
| 7 | …Stripe customer per user (p3) | PAY-5 | S4-05 |
| 8 | …invoices and receipts (p3) | PAY-5 | S4-06 |
| 9 | Currency-aware display everywhere, correct revenue per currency (p3) | PAY-6 | S2-05 (app screens), S6-07 (landing), S7-04 + S8-01 (admin totals) |
| 10 | Back-fill report for customers who paid but were not extended, reviewed before any change (p3, p6) | PAY-7 | S2-06, S2-07, S2-08 |
| 11 | Every photo request tied to its gallery; signed expiring links respecting password and download settings (p4) | SEC-1 | S3-01 … S3-04, S3-10 … S3-12 (scope depends on **D15**) |
| 12 | One shared rate limiter, lockout after repeated wrong passwords, fairer demo limit with cleanup (p4) | SEC-2 | S3-01, S3-05, S3-06, S3-07 |
| 13 | Secure cookies, security headers, proper input checks (p4) | SEC-3 | S3-05, S3-08, S3-09 |
| 14 | Keep original dates; remove selections when an account/gallery is deleted (p4) | SEC-4 | S4-01, S4-02 |
| 15 | Tests for payments/plans, checkout test in Stripe test mode, checks on every change, Sentry (p4) | STR-1 | S0-01 … S0-08, S1-11, S2-10 |
| 16 | One shared way to check sign-in/admin access, replacing the 9 copies (p4) | STR-2 | S5-04, S7-02 |
| 17 | Validated data handling; data types match what is stored (p4) | STR-3 | S3-09, S5-05 |
| 18 | Large files split; translations loaded per language (p4) | STR-4, STR-6 | S5-06 … S5-10 |
| 19 | One design system; remove duplicate libraries, dead code, hard-coded brand (p4) | STR-7, STR-8 | S5-02, S5-03, S5-11, S5-12 |
| 20 | New landing page, prices instant (server-generated), faster/better SEO (p5) | STR-5 | S6-01, S6-02, S6-07, S6-12, S6-14 |
| 21 | Landing uses same colours, fonts, components as the rest of the app (p5) | STR-7 | S5-02, S5-03, S5-12, S6-03 … S6-08 |
| 22 | Prices shown in the right currency for each visitor (p5) | PAY-6 | S6-07 (scope depends on **D4**) |
| 23 | Admin **Users**: search/open any account, see plan, expiry, galleries, payments; change/extend in a click (p5) | SEC-5 | S7-05 |
| 24 | Admin **Galleries**: browse with owner/status/activity; find, inspect, disable (p5) | SEC-5 | S7-06 |
| 25 | Admin **Payments**: payments, refunds, disputes, totals per currency, Stripe event history (p5) | PAY-4, PAY-6 | S8-01 |
| 26 | Admin **Support**: messages and problems with account + payments one click away (p5) | n/a | S8-02 |
| 27 | Admin **Overview** from stored counters, not full scans (p5) | SEC-5 | S7-04, S8-04 |
| 28 | Admin **Accountability**: audit log, search and paging everywhere, more admins later; old admin retired (p5) | SEC-5 | S7-02, S7-03, S7-05, S8-01 … S8-03, S8-05 |
| 29 | Feature: renewal reminders (14 and 3 days) and billing page, with public copy that matches what happens when a plan lapses (p6) | n/a | S9-02, S9-03, S9-07 (needs **D3**) |
| 30 | Feature: selection export (filenames, Lightroom-ready) (p6) | n/a | S10-01 |
| 31 | Feature: gallery stats (views, downloads, favourites) (p6) | n/a | S10-02 |
| 32 | Feature: Drive folder check before creating a gallery (p6) | n/a | S10-03 |
| 33 | Feature: gallery expiry date; switch off downloads after selection submitted (p6) | n/a | S9-05, S9-06 |
| 34 | Delivery phases 1–4 and their "done when" criteria (p6) | n/a | Phase 1 = S0–S2 · Phase 2 = S3–S4 · Phase 3 = S5–S8 · Phase 4 = S9–S10 · release = S11 |
| 35 | Safety rules: test mode before live keys; back-fill starts as a report; tests and monitoring first (p6) | n/a | `04-environments-testing-release.md`, S0, S2-07, S2-08 |
| 36 | Phase "done when" criteria, proven rather than assumed (p6) | n/a | gates R1 = S2-11, R2 = S4-09, R3 = S8-06, R4 = S10-05 |
| 37 | *(not in the PDF)* Feature polish and verification, release, monitoring, runbook, handover | n/a | S10-04, S11-01 … S11-05 |

## 2 · What this plan adds, changes or flags versus the PDF

These are **not** in the PDF. They are needed to deliver it honestly. Raise them with the
owner before the sprint they affect.

| ID | Gap / change | Why it matters | Where handled |
|---|---|---|---|
| G1 | **Photo protection has a ceiling.** Photos load straight from Google's CDN and the Drive folder must be public, so a hardened proxy alone does not make "originals only delivered when allowed" true. | The PDF promises more than hardening the proxy can deliver. | **D15**, S3 |
| G2 | **Mobile layouts were deferred**, but a landing page cannot ship desktop-only. | Over half of visitors are on phones. | **D11**, S6-00, S6-11 |
| G3 | **Admin back office has no design yet** (only the landing page was mocked up). | Rebuilding without a design wastes work. | S7-01 (design step) |
| G4 | **The dark mock-up drops DemoForm, tutorial video, TrustSection and the compare slider.** | DemoForm is a live conversion feature. | **D14**, S6-00, S6-09 |
| G5 | **Gallery-after-expiry is undecided, and the current landing promises "the link stays live / doesn't expire" and "no automatic charges".** | A feature (F1) and a promise conflict. | **D3**, S9-01, S9-04 |
| G6 | **"Right currency for each visitor"** is ambiguous: display each plan in its own currency, or price per visitor currency. Plans store one currency today. | Different data model and Stripe setup. | **D4** |
| G7 | **Server-rendering the landing page** conflicts with language stored in `localStorage` (client-only). | Server cannot render the visitor's language without a cookie. | **D16**, S5-06, S6-02 |
| G8 | **Greek / German / Dutch strings are longer** than the English mock-up; Manrope's Greek coverage must be confirmed. | Layout breakage in the main market. | **D8**, S5-01, S6-10 |
| G9 | **Environments**: no staging Firebase/Stripe/Sentry exists in the repo. | Cannot prove payment fixes safely. | **D12**, S0-01 |
| G10 | **Scope of "one design language"** for the dashboard and client gallery. | Avoids a hidden second redesign. | **D9**, S5-12 |
| G11 | **Existing `/lp/*` pages and `components/Hero.tsx`** use the light style. | Paid-traffic URLs and SEO. | **D13**, S6-13 |
| G12 | **Refund/dispute semantics** are not defined in the PDF ("update access automatically"). | Needed to write the handlers. | **D5**, S2-02 |
| G13 | **Tax/VAT** is not mentioned; invoices are. | EU buyers may need VAT handling. | **D10** |
| G14 | **Housekeeping found during planning**: rules `locked()` gap, legacy plaintext-password migration, `server-only` guards, BOM/mojibake, cron infra. | Small but real. | SEC-7/8/9 → S4-03, S4-04, S4-08, S5-11, D7 |
| G16 | **Nobody is told when a refund, dispute or failed payment happens.** The PDF says "update access automatically" but is silent on telling customers (their access may shrink or pause) or operators (payments that need a human). | Silent access changes cause support load and distrust; unmatched/flagged payments go unseen. | **D17**, S2-03, S2-13 … S2-16 |
| G15 | **Release and cutover** are one line in the PDF. | Payment changes need a rehearsed rollout. | S2-11, S4-09, S8-06, S11 |

## 3 · Decision log

Status: **Open** (not decided), **Default** (work may start on the recommended default;
change later is possible), **Decided**. Update this table whenever a decision is made and
reference the decision ID in commit messages.

| ID | Decision | Options | Recommended default | Needed by | Status |
|---|---|---|---|---|---|
| **D1** | Product name in UI and email | PhotoDrive (current default, used in the proposal and Figma) · the project's earlier working name (README, package, e-mail templates; all now replaced) | **PhotoDrive**; centralise in `lib/branding.ts`, no hard-coded copies | S5 | Default |
| **D2** | Real plans and prices | Mock-up values ($12/month, $99/year) are samples; real plans live in admin | Landing renders whatever public plans exist; no prices in code | S6 | Default |
| **D3** | What happens to galleries when the owner's plan lapses | (a) stay live forever (today) · (b) live during a grace period (e.g. 14 days), then a polite "temporarily unavailable" page; nothing deleted; restored on renewal · (c) offline immediately | **(b)**, but **the landing "Why PhotoDrive" copy must change first** ("link stays live… doesn't expire", "no automatic charges") | S9-01 | **Open** |
| **D4** | "Right currency per visitor" | (A) show each plan in its own currency, formatted for the visitor's locale · (B) plans carry several currency prices · (C) Stripe Adaptive Pricing | **(A)** now; keep the money util compatible with (B) | S6-02 | Default |
| **D5** | Refund / dispute policy | Full refund → remove that payment's granted time; partial refund → log + admin review; dispute opened → suspend; won → restore; lost → revoke | As listed (left column) | S2-02 | **Decided** (owner, 2026-11-25: default confirmed) |
| **D6** | Shared rate-limit store | Upstash Redis (Vercel Marketplace) · Firestore counters · Vercel KV | **Upstash Redis**, in-memory fallback for dev/tests | S3-01 | Default |
| **D7** | Scheduled jobs (reconcile, cleanup, reminders, stats recompute) | Vercel Cron → `/api/cron/*` secured by `CRON_SECRET` · Cloud Scheduler | **Vercel Cron** | S2-04 | Default |
| **D8** | Typeface for the app | Manrope everywhere (as in Concept B) · keep IBM Plex Sans (has Greek) | **Manrope** (the approved design uses it). Greek is a supported language, not the main market (D19), so the S5-01 Greek check is a quality check, not a gate: if Greek renders poorly, Greek text falls back to IBM Plex Sans through `unicode-range` while Latin stays Manrope | S5-01 | **Decided** (owner, 2026-11-26: approved Figma design uses Manrope; main market is English/US) |
| **D9** | Scope of re-skinning dashboard + client gallery | tokens + type only · full layout redesign | **Full redesign of the user area** (dashboard, client gallery, account, admin and their toasts, dialogs and empty states) in the same design language as the approved landing page (Concept B tokens, Manrope). **Designed directly in code, no Figma frames**, to save time. The landing page follows the approved Figma file exactly. Behaviour must not change: the browser snapshots in `scripts/verify/browser/` are the check | S5-12 | **Decided** (owner, 2026-11-26) |
| **D10** | Tax / VAT | Stripe Tax · out of scope (invoices only) | **Out of scope** unless the owner says otherwise | S4-06 | Default |
| **D11** | Mobile | Implement responsively from the desktop mock-up with documented breakpoints, and review on devices · produce Figma mobile frames first | **Produce Figma mobile frames (390px) as S6-00, then implement** | S6-00 | **Open** |
| **D12** | Environments | Separate Firebase staging project + Stripe test mode + Sentry project + Vercel preview env | **All four**, created by the owner (accounts and keys) | S0-01 | **Deferred by the owner (2026-11-25): staging will be set up much later.** Until then payment work is proven with the emulator suite and mocked Stripe, behind `BILLING_FULFIL_V2`; nothing is turned on in production without a test-mode run (S1-11, S2-10) |
| **D13** | Existing `/lp/*` pages and `components/Hero.tsx` | restyle to new tokens (keep URLs/content) · retire | **Restyle**, keep URLs for ads/SEO | S6-13 | Default |
| **D14** | Keep DemoForm, tutorial video, TrustSection, compare slider | keep all, restyled · drop some | **Keep DemoForm + video + trust content**, restyled; slider optional | S6-00 | Default |
| **D15** | Photo delivery model | (A) tiered: public galleries keep Google CDN delivery; **password-protected or download-disabled galleries** get opaque photo tokens and signed proxy delivery, no Drive ids/URLs in the client payload · (B) everything through the proxy · (C) harden proxy only | **(A)**; measure bandwidth in S3-11 before enabling for all protected galleries. State plainly in docs that the Drive folder itself stays public by design | S3-02 | **Decided** (owner, 2026-11-25): option A, applied to galleries by the visibility rule in D18 |
| **D17** | Notifications for payment events (refund, partial refund, dispute opened/won/lost, failed async payment, unmatched or flagged payment) | Channels: (a) customer e-mail · (b) customer in-app notice · (c) immediate admin e-mail alert · (d) Sentry alert · (e) daily admin digest e-mail | **a–e, all e-mail or in-app: no Slack or other chat integration** (owner, 2026-11-25). Sent through the existing `sendEmail` using **SMTP** (owner choice; `CONTACT_SMTP_*`, leave `RESEND_API_KEY` unset). Keep Stripe's own refund receipt e-mails switched on (they are the receipt); ours explain the effect on access. Customer e-mails use the user's stored language, are sent once per payment event and are best-effort (never fail the webhook) | S2-03, S2-13 … S2-16 | **Partly decided**: channels and SMTP decided; `ADMIN_ALERT_EMAIL` = `photodrive@gmail.com` (owner, 2026-11-25; set it in Vercel). Still needed: SMTP credentials in the environment (owner will provide; verify with `scripts/ops/send-test-email.ts`) and wording review of the customer copy |
| **D18** | Gallery visibility: public or private | Explicit **public / private** choice, private requires a password · today's optional password with no explicit mode | **Every gallery is either public (no password, the link opens it) or private (a password is required).** A private gallery cannot be saved without a password; a public gallery has none. Existing galleries behave exactly as today: one with a password is private, one without is public (derived while `visibility` is unset). Switching private to public removes the password (after confirmation). The protected delivery tier of D15 applies to **private galleries and galleries with downloads disabled** | S3-13, S3-02, S3-03, S3-05 | **Decided** (owner, 2026-11-25) |
| **D16** | Language routing for a server-rendered landing page | cookie + dynamic SSR (keep URLs) · `/[lang]` static routes + redirect | **Cookie + dynamic SSR**; revisit `/[lang]` for SEO later | S5-06 | Default |
| **D19** | Primary market and language | English/US first · Greek first | **English, United States first.** Greek, Dutch, German, Spanish and Italian stay supported. Consequences: English copy is the reference and gets the review priority; money, dates and number formats default to en-US; prices read in USD unless a plan says otherwise (D4); the default language for a visitor with no cookie and no matching `Accept-Language` stays English | all | **Decided** (owner, 2026-11-26) |

### Open decisions that block work

- **D12** (staging) is deferred by the owner. Code work continues on the emulator suite; every task whose "done when" needs staging stays *in progress* (S0-01, S0-06, S1-08, S1-11, S2-02, S2-04, S2-10) and the production rollout (R1, S2-11) cannot start until staging exists.
- **D3** blocks S9 (and requires a copy change on the landing page before S6 ships).
- **D17** (channels and SMTP decided) still needs the `ADMIN_ALERT_EMAIL` address, the SMTP credentials and a wording review before S2-14 / S2-15 / S2-16 ship (the immediate admin alert in S2-03 uses the env-configured address and only logs until it is set).
- **D11** should be settled before S6 (it has a default). **D15** (photo delivery, option A) and **D18** (public/private galleries) are decided.
