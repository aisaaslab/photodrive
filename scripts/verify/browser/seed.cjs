process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const bcrypt = require("bcryptjs");
const OWNER = "photographer1";
const EMAIL = "photographer@example.com";
const PASSWORD = "test-password-1";

// A photographer in the Auth emulator (so the app's own login form works), with an active subscription.
async function ensurePhotographer() {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  // The emulator's project-level endpoint (authorised by the fixed "owner" bearer) accepts a chosen user id; the public sign-up one does not.
  const res = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/projects/demo-photodrive/accounts`, {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, localId: OWNER, displayName: "Test Photographer", emailVerified: true }),
  });
  if (!res.ok && !(await res.text()).includes("DUPLICATE")) throw new Error("could not create the test photographer");
}

(async () => {
  await ensurePhotographer();
  initializeApp({ credential: cert({ projectId: "demo-photodrive", clientEmail: "x@demo-photodrive.iam.gserviceaccount.com", privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY }) });
  const db = getFirestore();
  const base = { photographerId: OWNER, folderId: "1DriveFolderIdDDDDDDDDDDDDDDDDDDDDDD", createdAt: Date.now(), coverFileId: "1DriveImageFileIdAAAAAAAAAAAAAAAAAAA" };
  await db.collection("users").doc(OWNER).set({
    uid: OWNER, email: EMAIL, name: "Test Photographer", createdAt: Date.now(),
    subscriptionStatus: "active", subscriptionExpiresAt: Date.now() + 365 * 24 * 3600 * 1000, planName: "Yearly", planInterval: "yearly",
  });
  await db.collection("galleries").doc("g-priv").set({ ...base, name: "Private test", slug: "privtest", createdAt: Date.now() - 2 * 3600 * 1000, visibility: "private", passwordHash: await bcrypt.hash("hunter2", 10), pwChangedAt: 0 });
  await db.collection("galleries").doc("g-nodl").set({ ...base, name: "No downloads", slug: "nodltest", createdAt: Date.now() - 3 * 3600 * 1000, allowDownload: false });
  await db.collection("galleries").doc("g-pub").set({ ...base, name: "Public test", slug: "pubtest", createdAt: Date.now() - 1 * 3600 * 1000 });
  await db.collection("galleries").doc("g-big").set({ ...base, folderId: "BIGFOLDER000000000000000000000000", coverFileId: null, name: "Big gallery", slug: "bigtest", createdAt: Date.now() - 4 * 3600 * 1000 });
  // A client's favourites and submission on the public gallery, so the photographer's "Favorites" panel has something to show.
  await db.collection("gallery_selections").doc("g-pub").set({
    galleryId: "g-pub", count: 2, updatedAt: Date.now(),
    items: [{ id: "1DriveImageFileIdAAAAAAAAAAAAAAAAAAA", name: "a.jpg" }, { id: "1DriveImageFileIdBBBBBBBBBBBBBBBBBBB", name: "b.jpg" }],
    submission: { name: "Maria Client", email: "maria@example.com", note: "Please retouch these", count: 2, submittedAt: Date.now() - 3600 * 1000 },
  });
  console.log("seeded");
})();
