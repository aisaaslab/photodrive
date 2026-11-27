/**
 * Adds two public plans to the emulator for the landing page pricing check: "Pro" monthly $12 and "Pro" yearly $99 (a 31% saving,
 * highlighted). seed.cjs already adds "Yearly" at 99 EUR. Run after seed.cjs, before the server's first request.
 */
const admin = require("./admin-compat.cjs");
const db = admin.firestore();
(async () => {
  const now = Date.now();
  const base = { description: "", features: ["Unlimited galleries", "Passwords per gallery"], isPublic: true, active: true, createdAt: now, updatedAt: now };
  await db.collection("plans").doc("p-pro-month").set({ ...base, name: "Pro", interval: "monthly", priceCents: 1200, currency: "usd", highlight: false, sortOrder: 0 });
  await db.collection("plans").doc("p-pro-year").set({ ...base, name: "Pro", interval: "yearly", priceCents: 9900, currency: "usd", highlight: true, sortOrder: 0 });
  console.log("plans seeded");
})();
