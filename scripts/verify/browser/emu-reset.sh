#!/usr/bin/env bash
# Wipe the Firebase emulators (Firestore and Auth) and seed the browser-check data (seed.cjs).
# Needs the emulators running: `npm run emu`. Safe: it only talks to 127.0.0.1 and the demo-photodrive project.
# Usage: scripts/verify/browser/emu-reset.sh [--plans]   (--plans also adds the pricing plans for landing.cjs with WITH_PLANS=1)
set -euo pipefail
cd "$(dirname "$0")/../../.."
KEY="${TMPDIR:-/tmp}/photodrive-fake-key.pem"
[ -f "$KEY" ] || openssl genrsa -out "$KEY" 2048 2>/dev/null
curl -s -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/demo-photodrive/databases/(default)/documents" >/dev/null
curl -s -X DELETE "http://127.0.0.1:9099/emulator/v1/projects/demo-photodrive/accounts" >/dev/null
export FIREBASE_ADMIN_PRIVATE_KEY="$(cat "$KEY")"
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 NODE_PATH="$PWD/node_modules" node scripts/verify/browser/seed.cjs
if [ "${1:-}" = "--plans" ]; then
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 NODE_PATH="$PWD/node_modules" node scripts/verify/browser/seed-plans.cjs
fi
