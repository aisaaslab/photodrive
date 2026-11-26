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

Prints one PASS/FAIL line per check. On staging, run the same page checks by hand against a real private gallery (S3-11).
