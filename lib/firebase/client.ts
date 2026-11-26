import { initializeApp, getApps } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { emulatorConfig } from "./emulator";

// `||` (not `??`) on purpose: a freshly copied .env.example leaves these as
// empty strings, and Firebase rejects "" with auth/invalid-api-key during
// `next build`. Falling back keeps the build working before setup is finished;
// real auth still requires the operator's own values in .env.local.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "placeholder",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "placeholder.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "placeholder",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "placeholder.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:000000000000:web:placeholder",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);

// Test setup only: point the browser at the local emulators (see lib/firebase/emulator.ts for the safety rule). Never active in a real deployment.
const emulators = emulatorConfig({
  flag: process.env.NEXT_PUBLIC_FIREBASE_EMULATORS,
  projectId: firebaseConfig.projectId,
  authHost: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
  firestoreHost: process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST,
});
const g = globalThis as { __firebaseEmulatorsConnected?: boolean };
if (emulators && !g.__firebaseEmulatorsConnected) {
  g.__firebaseEmulatorsConnected = true;
  connectAuthEmulator(auth, `http://${emulators.auth.host}:${emulators.auth.port}`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulators.firestore.host, emulators.firestore.port);
}
