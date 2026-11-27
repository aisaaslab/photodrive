import { testAuth, testDb } from "./db";

export async function seedUser(uid: string, data: Record<string, unknown> = {}, email = `${uid}@example.com`) {
  await testAuth().createUser({ uid, email });
  await testDb().collection("users").doc(uid).set({ email, emailLower: email.trim().toLowerCase(), createdAt: Date.now(), ...data });
  return uid;
}

export async function seedPlan(id: string, data: Record<string, unknown> = {}) {
  await testDb().collection("plans").doc(id).set({ name: id, active: true, ...data });
  return id;
}

export async function seedPayment(sessionId: string, data: Record<string, unknown> = {}) {
  await testDb().collection("payments").doc(sessionId).set({ createdAt: Date.now(), ...data });
  return sessionId;
}
