import { z } from "zod";

/**
 * POST /api/galleries and PATCH /api/galleries/[id] (also the admin PATCH).
 *
 * The body must be a JSON object, and the two fields that are stored as-is, `name` and `driveUrl`, must be strings of a sane
 * size (before, `{"name": {...}}` was written to Firestore as an object). The other fields are deliberately validated by the
 * routes' own, tested helpers (`planCreate`/`planUpdate` for visibility and password, `validTitleFont`, `validCoverPos` ...),
 * which drop junk values rather than reject the whole request, because the editor sends every field on each save. Unknown
 * fields pass through here and are ignored by the routes, which only ever read the fields they know.
 */
export const GalleryBody = z.looseObject({
  name: z.string().max(200).optional(),
  driveUrl: z.string().max(500).optional(),
});
