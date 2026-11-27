/**
 * A small stand-in for the old namespaced `firebase-admin` API (`admin.firestore()`, `admin.auth()`, `admin.firestore.FieldValue`), which
 * firebase-admin 14 removed, so the browser-check scripts can keep their short form. Emulators only (project demo-photodrive).
 */
const path = require("node:path");
// Resolved from the project folder (the scripts are run from the repository root), through the package's export map.
const req = require("node:module").createRequire(path.join(process.cwd(), "package.json"));
const mod = (name) => req(`firebase-admin/${name}`);
const { initializeApp, getApps } = mod("app");
const fs = mod("firestore");
const { getAuth } = mod("auth");
const app = getApps()[0] ?? initializeApp({ projectId: "demo-photodrive" });
const firestore = () => fs.getFirestore(app);
firestore.FieldValue = fs.FieldValue;
firestore.Timestamp = fs.Timestamp;
module.exports = { firestore, auth: () => getAuth(app) };
