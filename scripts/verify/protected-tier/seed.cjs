process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const bcrypt = require("bcryptjs");
(async () => {
  initializeApp({ credential: cert({ projectId: "demo-photodrive", clientEmail: "x@demo-photodrive.iam.gserviceaccount.com", privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY }) });
  const db = getFirestore();
  const base = { photographerId: "owner", folderId: "1DriveFolderIdDDDDDDDDDDDDDDDDDDDDDD", createdAt: Date.now(), coverFileId: "1DriveImageFileIdAAAAAAAAAAAAAAAAAAA" };
  await db.collection("galleries").doc("g-priv").set({ ...base, name: "Private test", slug: "privtest", visibility: "private", passwordHash: await bcrypt.hash("hunter2", 10), pwChangedAt: 0 });
  await db.collection("galleries").doc("g-nodl").set({ ...base, name: "No downloads", slug: "nodltest", allowDownload: false });
  await db.collection("galleries").doc("g-pub").set({ ...base, name: "Public test", slug: "pubtest" });
  await db.collection("galleries").doc("g-big").set({ ...base, folderId: "BIGFOLDER000000000000000000000000", coverFileId: null, name: "Big gallery", slug: "bigtest" });
  console.log("seeded");
})();
