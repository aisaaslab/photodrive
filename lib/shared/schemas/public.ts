import { z } from "zod";
import { MAX_GALLERY_PASSWORD_LENGTH } from "@/lib/gallery/visibility";
import { JsonObject } from "./common";

/** POST /api/gallery/verify-password. Bounded so a huge password cannot be used to burn CPU in bcrypt. */
export const VerifyPasswordBody = z.object({
  slug: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(MAX_GALLERY_PASSWORD_LENGTH),
});

/** POST /api/demo/create */
export const DemoCreateBody = z.object({ driveUrl: z.string().min(1).max(500) });

/**
 * POST /api/contact and /api/galleries/[id]/selection/submit. Text fields are optional and loosely typed on purpose: the
 * routes clean them (trim, cut to length, lower-case the e-mail) and apply their own rules with friendly messages, and a
 * honeypot hit must still answer ok. What the schema guarantees is the shape: an object, never an array or a scalar.
 */
export const ContactBody = JsonObject;
export const SelectionSubmitBody = JsonObject;

/** POST /api/galleries/[id]/selection (add or remove one favourite). */
export const SelectionToggleBody = z.object({
  action: z.enum(["add", "remove"]),
  item: z.object({
    id: z.string().min(1).max(200),
    name: z.string().max(1000).optional(),
  }),
});
