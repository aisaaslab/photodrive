import { z } from "zod";

/** A JSON object (not an array, null or a scalar). Routes that read optional fields one by one validate them after this. */
export const JsonObject = z.record(z.string(), z.unknown());

/** Trimmed text with a length ceiling; the bound exists so one request cannot carry megabytes into Firestore or e-mail. */
export const text = (max: number) => z.string().trim().max(max);
