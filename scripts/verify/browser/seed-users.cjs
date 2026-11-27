/**
 * Seeds the Users screen check (S7-05): N bulk profiles (default 1,200, Firestore only, so the list is long) plus a handful of named people
 * with Auth accounts in different access states, galleries and payments. Run after seed.cjs, against the emulators only.
 *   FIREBASE_ADMIN_PRIVATE_KEY=... FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 NODE_PATH=$PWD/node_modules node scripts/verify/browser/seed-users.cjs [N]
 */
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const N = Number(process.argv[2] ?? 1200);
const DAY = 86400000;
(async () => {
  const app = initializeApp({ credential: cert({ projectId: "demo-photodrive", clientEmail: "x@demo-photodrive.iam.gserviceaccount.com", privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY }) });
  const db = getFirestore(app), auth = getAuth(app), now = Date.now();
  for (let i = 0; i < N; i += 400) {
    const b = db.batch();
    for (let j = i; j < Math.min(N, i + 400); j++) {
      const id = `bulk${String(j).padStart(4, "0")}`, email = `Bulk${String(j).padStart(4, "0")}@example.com`;
      b.set(db.collection("users").doc(id), { uid: id, email, emailLower: email.toLowerCase(), name: `Bulk User ${j}`, createdAt: Timestamp.fromMillis(now - j * 3600000) });
    }
    await b.commit();
  }
  const people = [
    ["anna", "Anna Keller", { subscriptionStatus: "active", subscriptionExpiresAt: now + 200 * DAY, planName: "Yearly", planInterval: "yearly" }],
    ["ben", "Ben Okafor", { subscriptionStatus: "active", subscriptionExpiresAt: now + 6 * DAY, planName: "Monthly", planInterval: "monthly" }],
    ["carla", "Carla Reyes", { subscriptionStatus: "active", subscriptionExpiresAt: 32503680000000, compGranted: true, planName: "Lifetime" }],
    ["dev", "Dev Patel", { subscriptionStatus: "active", subscriptionExpiresAt: now - 10 * DAY, planName: "Monthly", planInterval: "monthly" }],
    ["elena", "Elena Rossi", {}],
  ];
  for (const [id, name, extra] of people) {
    const email = `${id}@example.com`;
    await auth.createUser({ uid: id, email, displayName: name, password: "test-password-1" }).catch(() => {});
    await db.collection("users").doc(id).set({ uid: id, email, emailLower: email, name, createdAt: Timestamp.fromMillis(now - 40 * DAY), ...extra });
  }
  const g = (id, owner, name, slug, extra = {}) => db.collection("galleries").doc(id).set({ photographerId: owner, name, slug, folderId: "1DriveFolderIdDDDDDDDDDDDDDDDDDDDDDD", createdAt: now - 3 * DAY, ...extra });
  await g("ga1", "anna", "Keller wedding", "keller-wedding"); await g("ga2", "anna", "Studio portraits", "studio-portraits", { visibility: "private", passwordHash: "x" });
  await g("gb1", "ben", "Okafor family", "okafor-family");
  await db.collection("payments").doc("cs_anna").set({ uid: "anna", amountTotal: 9900, currency: "usd", status: "fulfilled", activatedAt: now - 160 * DAY });
  await db.collection("payments").doc("cs_ben").set({ uid: "ben", amountTotal: 1500, currency: "usd", status: "refunded", needsReview: true, reviewNote: "Refunded in Stripe; check the expiry", refundedAmount: 1500, activatedAt: now - 24 * DAY });
  console.log(`seeded ${N} bulk users and ${people.length} named people`);
})();
