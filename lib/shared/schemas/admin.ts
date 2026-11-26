import { z } from "zod";

/** POST /api/admin/subscription */
export const AdminSubscriptionBody = z.object({
  // A Firestore document id: never empty and never containing a slash.
  uid: z.string().min(1).max(128).regex(/^[^/]+$/),
  action: z.enum(["assign_plan", "grant_lifetime", "grant_year", "revoke"]),
  planId: z.string().min(1).max(128).regex(/^[^/]+$/).optional(),
});
