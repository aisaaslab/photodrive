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
NODE_PATH=$PWD/node_modules node scripts/verify/protected-tier/seed.cjs            # three galleries: private, downloads-off, public

FIREBASE_ADMIN_PROJECT_ID=demo-photodrive FIREBASE_ADMIN_CLIENT_EMAIL=x@demo-photodrive.iam.gserviceaccount.com \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GALLERY_JWT_SECRET=e2e-secret-for-gallery-tokens-0123456789 \
GOOGLE_DRIVE_API_KEY=fake MEDIA_PROTECTED_TIER=1 NODE_OPTIONS="--require $PWD/scripts/verify/protected-tier/fake-drive.cjs" \
npx next start -p 3997 &

NODE_PATH=$(npm root -g) node scripts/verify/protected-tier/browser.cjs          # Playwright (preinstalled globally in the cloud sandbox)
```

Also `NODE_PATH=$(npm root -g) node scripts/verify/protected-tier/zip.cjs` checks, in the same setup, that selecting photos and pressing "Download (.zip)" yields a valid zip in the browser (public gallery through the proxy, private gallery through the signed URLs).

**Behaviour snapshot** (`gallery-snapshot.cjs`): records 33 observable facts about the public gallery page (tab counts, search, sort, folders, show-more, selection mode, favourites persisted through the server, and the lightbox: counter, keys, zoom, thumbnail strip, slideshow, video) as JSON. It uses the seeded `bigtest` gallery (130 files and a subfolder, served by `fake-drive.cjs`). Reset the emulator and reseed before each run (the favourites step writes), then compare two runs with `diff`: identical output means a refactor changed nothing a visitor can see. Used for S5-08 and S5-10.

Prints one PASS/FAIL line per check. On staging, run the same page checks by hand against a real private gallery (S3-11).
