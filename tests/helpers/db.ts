import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const TEST_PROJECT = "demo-photodrive";

/** Admin SDK bound to the local emulators. Refuses to run without them. */
function app() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST is not set: run via `npm run test:emu` so tests never touch a real project.");
  }
  return getApps()[0] ?? initializeApp({ projectId: TEST_PROJECT });
}

export const testDb = () => getFirestore(app());
export const testAuth = () => getAuth(app());

/** Wipe all emulator data between tests. */
export async function clearEmulators() {
  const host = process.env.FIRESTORE_EMULATOR_HOST!;
  await fetch(`http://${host}/emulator/v1/projects/${TEST_PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  const auth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (auth) await fetch(`http://${auth}/emulator/v1/projects/${TEST_PROJECT}/accounts`, { method: "DELETE" });
}
