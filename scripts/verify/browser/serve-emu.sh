#!/usr/bin/env bash
# Start the production server on :3997 against the emulators, with a stand-in for Google Drive (fake-drive.cjs) and throwaway secrets.
# Build first, with the browser pointed at the emulators:
#   NEXT_PUBLIC_FIREBASE_EMULATORS=1 NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-photodrive NEXT_PUBLIC_FIREBASE_API_KEY=fake-key npm run build
# (the switch in lib/firebase/emulator.ts only activates for a project id starting with `demo-`). No real credentials are used or needed.
# Stop it with: pkill -f next-server
set -euo pipefail
cd "$(dirname "$0")/../../.."
KEY="${TMPDIR:-/tmp}/photodrive-fake-key.pem"
[ -f "$KEY" ] || openssl genrsa -out "$KEY" 2048 2>/dev/null
pkill -f next-server 2>/dev/null || true; pkill -f "next start" 2>/dev/null || true; sleep 1
env FIREBASE_ADMIN_PRIVATE_KEY="$(cat "$KEY")" FIREBASE_ADMIN_PROJECT_ID=demo-photodrive FIREBASE_ADMIN_CLIENT_EMAIL=x@demo-photodrive.iam.gserviceaccount.com \
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GALLERY_JWT_SECRET=e2e-secret-for-gallery-tokens-0123456789 GOOGLE_DRIVE_API_KEY=fake \
  MEDIA_PROTECTED_TIER=1 ADMIN_UID=nobody NODE_OPTIONS="--require $PWD/scripts/verify/browser/fake-drive.cjs" \
  nohup npx next start -p 3997 > "${TMPDIR:-/tmp}/photodrive-next.log" 2>&1 &
for _ in $(seq 1 40); do sleep 1; curl -s -o /dev/null http://localhost:3997/terms && echo "server up on :3997 (log: ${TMPDIR:-/tmp}/photodrive-next.log)" && exit 0; done
echo "server did not start; see ${TMPDIR:-/tmp}/photodrive-next.log" >&2; exit 1
