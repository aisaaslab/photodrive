# Protected-tier browser check (S3-03)

Proves, in a real browser against a production build, that a private gallery (and one with downloads off) sends **no Drive file id and
no Google image/Drive URL** to the visitor, and that the signed `/api/g/…` delivery works: images load, originals need the unlock
cookie, a tampered link is refused, videos stream from the signed URL, favourites travel as tokens, and a public gallery is delivered
exactly as before.

It needs no network and no real credentials: Firestore runs in the emulator, Google Drive is stood in for by `fake-drive.cjs`
(preloaded into the Next server), and the Firebase key is a throwaway one generated on the spot.

```bash
npm run build
openssl genrsa -out /tmp/fake-key.pem 2048
npx firebase emulators:start --only auth,firestore --project demo-photodrive &        # wait until port 8080 answers

export FIREBASE_ADMIN_PRIVATE_KEY="$(cat /tmp/fake-key.pem)"
NODE_PATH=$PWD/node_modules node scripts/verify/browser/seed.cjs            # three galleries: private, downloads-off, public

FIREBASE_ADMIN_PROJECT_ID=demo-photodrive FIREBASE_ADMIN_CLIENT_EMAIL=x@demo-photodrive.iam.gserviceaccount.com \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GALLERY_JWT_SECRET=e2e-secret-for-gallery-tokens-0123456789 \
GOOGLE_DRIVE_API_KEY=fake MEDIA_PROTECTED_TIER=1 NODE_OPTIONS="--require $PWD/scripts/verify/browser/fake-drive.cjs" \
npx next start -p 3997 &

NODE_PATH=$(npm root -g) node scripts/verify/browser/browser.cjs          # Playwright (preinstalled globally in the cloud sandbox)
```

Also `NODE_PATH=$(npm root -g) node scripts/verify/browser/zip.cjs` checks, in the same setup, that selecting photos and pressing "Download (.zip)" yields a valid zip in the browser (public gallery through the proxy, private gallery through the signed URLs).

**Behaviour snapshot** (`gallery-snapshot.cjs`): records 33 observable facts about the public gallery page (tab counts, search, sort, folders, show-more, selection mode, favourites persisted through the server, and the lightbox: counter, keys, zoom, thumbnail strip, slideshow, video) as JSON. It uses the seeded `bigtest` gallery (130 files and a subfolder, served by `fake-drive.cjs`). Reset the emulator and reseed before each run (the favourites step writes), then compare two runs with `diff`: identical output means a refactor changed nothing a visitor can see. Used for S5-08 and S5-10.

**Signed-in dashboard snapshot** (`dashboard-snapshot.cjs`): signs a fake photographer in through the app's own login form and records 38 observations of what the dashboard DOES (cards, search, sort, copy link, the client's favourites panel and the owner's zip download, the settings modal and its validations, cover picker, delete, new gallery) together with every API request the screens send. It records behaviour, not appearance, so it stays valid through a redesign (the selectors use visible text and ARIA roles; expect to update them when labels change).
It needs the browser pointed at the emulators: build with `NEXT_PUBLIC_FIREBASE_EMULATORS=1 NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-photodrive NEXT_PUBLIC_FIREBASE_API_KEY=fake-key` (the switch in `lib/firebase/emulator.ts` only activates for a `demo-` project), start the server with `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` as well, and let `seed.cjs` create the photographer. Reset the emulators (Firestore and Auth) and reseed before each run, then `diff` two runs.

**Language check** (`i18n.cjs`, S5-06): proves one language per page, server-rendered in the visitor's language, remembered in a cookie. It needs the real dictionaries, so run it with tsx: `NODE_PATH=$(npm root -g) npx tsx scripts/verify/browser/i18n.cjs` (a production build on :3997, no Drive or sign-in needed).

**UI primitives** (`ui-primitives.cjs`, S5-03): real hover, focus, keyboard and ARIA checks on `/dev/ui`. Start the production server with `SHOW_DEV_UI=1` (the page is a 404 without it) and run `NODE_PATH=$(npm root -g) node scripts/verify/browser/ui-primitives.cjs`; set `SHOT=<dir>` to save screenshots at 1440, 1024 and 390.

**New landing page** (`landing.cjs`, S6): server-rendered copy in six languages, no horizontal overflow at 1440/1024/390 in every language, the phone menu, anchors and CTAs. Run with tsx: `NODE_PATH=$(npm root -g) npx tsx scripts/verify/browser/landing.cjs` against a production server on :3997; `SHOT=<dir>` saves full-page screenshots. With `WITH_PLANS=1` it also checks the pricing section against plans seeded in the emulator (run `seed.cjs`, then `seed-plans.cjs`, start the server with the emulator variables, then run it); without it, it checks the no-plans card.

**Stored baselines** (`baselines/dashboard.json`, `baselines/gallery.json`): the output of the two snapshot scripts on a known-good build (dashboard baseline re-taken after the S5-12 photographer-area re-skin; its only differences from the earlier one are the language button reading "EN" and the Drive folder field having a label). To check a change: `emu-reset.sh`, `serve-emu.sh`, run the script into a file, `diff` it with the baseline. Update a baseline only on purpose, in the same commit as the UI change that explains it.

**User-area screens** (`user-area-shots.cjs`): screenshots plus an axe audit (set `AXE_PATH` to an `axe.min.js`, for example from `npm pack axe-core`) of login, dashboard, settings dialog, new-gallery form, favourites modal and account at 1280 and 390.

Prints one PASS/FAIL line per check. On staging, run the same page checks by hand against a real private gallery (S3-11).

**Admin Users screen** (`admin-users.cjs`, S7-05): 30 checks of the paged, searchable, filterable Users list and its detail drawer (paging to the end of 1,200+ profiles, search, the four filters, drawer actions, delete confirmation, focus, no overflow at 1440 and 390, axe with `AXE_PATH`). Setup: `emu-reset.sh`, `seed-users.cjs [N]` (bulk profiles plus five named people), then `ADMIN_UID=photographer1 serve-emu.sh` (the seeded photographer becomes the administrator), then `NODE_PATH=$(npm root -g) node scripts/verify/browser/admin-users.cjs` (`SHOT=<dir>` saves screenshots).

**Admin Galleries screen and the "not available" page** (`admin-galleries.cjs`, S7-06): 25 checks (list, paging, search, switch off with a reason, what a visitor and a crawler get, German at 390, switch on, owner link into Users, axe). Same setup as the Users check (`seed-users.cjs` also seeds 60 bulk galleries).

**Billing page** (`billing.cjs`, S9-02): signs in through the real login form and puts the seeded photographer into every plan state (no plan, active, expiring, comped, lifetime, grace, ended, long lapsed), checking the status, message, button and "what happens when your plan ends" block, plus US-style dates, the Account link, German at 390 px and (with `AXE_PATH`) accessibility. Run it twice, once per server setup: `ENFORCED=1` against a server started with `GALLERY_LAPSE_ENFORCE=1 REMINDERS_MODE=send BILLING_FULFIL_V2=1 scripts/verify/browser/serve-emu.sh`, and `ENFORCED=0` against the plain one. Wait for both emulators (ports 8080 and 9099) before `emu-reset.sh`.

**Admin Payments screen** (`payments.cjs`, S8-01): seeds payments and Stripe events, starts a small stand-in for Stripe on :12111 and walks an administrator through the screen: totals per currency, the needs-attention queue, filters and search, the payment drawer, re-sync, crediting an unmatched payment to a customer, marking items reviewed (with notes and the audit trail), 390 px, accessibility, and a customer being refused. Start the server with `ADMIN_UID=photographer1 STRIPE_SECRET_KEY=sk_test_fake STRIPE_API_BASE_URL=http://127.0.0.1:12111 APP_ENV=local scripts/verify/browser/serve-emu.sh`, then `NODE_PATH=$(npm root -g) [AXE_PATH=...] [SHOT=<dir>] node scripts/verify/browser/payments.cjs`. (`seed-users.cjs` needs `FIREBASE_ADMIN_PRIVATE_KEY` and the emulator hosts in the environment, as `emu-reset.sh` sets them; reset before each run, or counts such as "the real total" drift.)

**Admin Support inbox** (`support.cjs`, S8-02): seeds a customer (Firebase Auth account plus profile) and four messages, then walks an administrator through counts and filters, search, opening a message (marks it read), the matched account and its links, the reply link, a note, resolve / reopen / mark unread / delete, the audit trail, 390 px (including the current tab scrolled into view), accessibility and a customer being refused. Start the server with `ADMIN_UID=photographer1 scripts/verify/browser/serve-emu.sh`, then `NODE_PATH=$(npm root -g) [AXE_PATH=...] [SHOT=<dir>] node scripts/verify/browser/support.cjs` (reset first). Note: run `admin-galleries.cjs` before `admin-users.cjs` or reseed between them: the Users check deletes accounts, which changes the gallery total the Galleries check counts.

**Admin Plans and Promo codes** (`plans.cjs`, S8-03): walks an administrator through the plan editor (validation, currencies, the live preview and its warnings), creating, editing, hiding and deleting plans while checking the landing page's pricing after each (its cache is warmed first, so this proves the cache is expired on save), an error from the server being shown, the audit trail, the promo code rules end to end, 390 px, accessibility and a customer being refused. Setup: `scripts/verify/browser/emu-reset.sh --plans`, serve with `ADMIN_UID=photographer1 scripts/verify/browser/serve-emu.sh`, then `NODE_PATH=$(npm root -g) [AXE_PATH=...] [SHOT=<dir>] node scripts/verify/browser/plans.cjs`. Note that `innerText` returns text after CSS `text-transform`, so match headings and plan names case-insensitively.

**Admin Overview and Settings** (`overview.cjs`, S8-04): seeds ten expiring plans, payments in USD / JPY / EUR, an open payment review and two unread messages, then walks an administrator through revenue per currency, the live needs-attention strip and tab badges, the numbers' age and Refresh (30-second rule), "+N more" and Open account, Settings validation / saving / "last changed by" / audit, 390 px, accessibility and a customer being refused. Start the server with `ADMIN_UID=photographer1 scripts/verify/browser/serve-emu.sh`, then `NODE_PATH=$(npm root -g) [AXE_PATH=...] [SHOT=<dir>] node scripts/verify/browser/overview.cjs` (reset first).

**Dashboard layout choice** (`dashboard-density.cjs`, S5-12): cards or compact list, remembered between visits, keyboard use, the switch hidden on a phone, no action label cut at 390 px, axe. Start the server with `scripts/verify/browser/serve-emu.sh`, then `NODE_PATH=$(npm root -g) [AXE_PATH=...] [SHOT=<dir>] node scripts/verify/browser/dashboard-density.cjs` (reset first; do not run it right after `user-area-langs.cjs` without resetting).

**Subscribe and thank-you** (`subscribe.cjs`, S5-12): plan picker as a radio group (saving, per-month figure, arrow keys), thank-you steps signed out and for an active account, 390 px, axe. Reset with `emu-reset.sh --plans`, start `serve-emu.sh`, then `NODE_PATH=$(npm root -g) [AXE_PATH=...] [SHOT=<dir>] node scripts/verify/browser/subscribe.cjs`.

**Client password gate** (`password-gate.cjs`, S5-12): label and focus, "Shared by", show/hide, wrong password announced with the field selected, 390 px, axe, the right password opening the gallery. Reset with `emu-reset.sh`, start `serve-emu.sh`, then `NODE_PATH=$(npm root -g) [AXE_PATH=...] [SHOT=<dir>] node scripts/verify/browser/password-gate.cjs`.

**Account payments** (`account-payments.cjs`, S5-12): payment rows on the Account page (what each bought, access date, free code, refund note, invoice link), 390 px, axe. Reset, start `serve-emu.sh` WITHOUT `ADMIN_UID` (an administrator has no payments), then `NODE_PATH=$(npm root -g) [AXE_PATH=...] [SHOT=<dir>] node scripts/verify/browser/account-payments.cjs`.

**Client gallery hero and header** (`gallery-hero.cjs`, S5-12): the name in the sticky header after the hero scrolls away, the View photos cue, the skip link, 390 px, axe. Reset, start `serve-emu.sh`, then `NODE_PATH=$(npm root -g) [AXE_PATH=...] [SHOT=<dir>] node scripts/verify/browser/gallery-hero.cjs`.

**Toasts and undoable delete** (`toasts.cjs`, S5-12): the delayed DELETE with Undo, dismiss, leaving the page, 390 px, axe. Reset, start `serve-emu.sh`, then `NODE_PATH=$(npm root -g) [AXE_PATH=...] [SHOT=<dir>] node scripts/verify/browser/toasts.cjs` (takes about a minute: it waits out the undo time twice).

**Keyboard and phone pass** (`keyboard-mobile.cjs`, S5-12): Tab walk with a focus-indicator check on nine user-area screens, dialogs and menus from the keyboard (Escape, focus return), the photo viewer, and at 390 px no overflow and every control at least 24 x 24 px. Reset with `emu-reset.sh --plans`, start `serve-emu.sh` WITHOUT `ADMIN_UID`, then `NODE_PATH=$(npm root -g) node scripts/verify/browser/keyboard-mobile.cjs`.
