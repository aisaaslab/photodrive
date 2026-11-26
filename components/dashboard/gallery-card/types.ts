import type { useGallerySettings } from "./useGallerySettings";

/** The settings dialog's form: its values, the setter and the error setter, from useGallerySettings. */
export type GallerySettingsForm = Pick<ReturnType<typeof useGallerySettings>, "values" | "set" | "setError">;
