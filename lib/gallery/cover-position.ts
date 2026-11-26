/**
 * Cover/banner focal point.
 *
 * The public gallery banner is a wide strip that crops the chosen photo with
 * `object-fit: cover`. The photographer picks which part of the photo stays
 * visible by dragging it in the cover picker; we store that as a focal point in
 * percent (0–100) on each axis, and render it with `object-position`.
 * 50 / 50 = centered, which is the pre-existing look, so unset = unchanged.
 */

/**
 * Recommended banner artwork, shown to photographers in the cover picker.
 * The banner is full-width and at most 440px tall, so ~3:1 landscape at 2400px
 * wide covers retina desktops. Mobile shows a much narrower slice (about 3:2),
 * which is why keeping the subject near the middle is part of the advice.
 */
export const COVER_RECOMMENDED = {
  width: 2400,
  height: 800,
  /** Smallest width we consider sharp enough on a wide desktop screen. */
  minWidth: 1600,
  /** Aspect ratio of the desktop banner preview (w / h). */
  desktopAspect: 3,
  /** Aspect ratio of the mobile banner preview (w / h). */
  mobileAspect: 1.5,
} as const;

export const COVER_POS_DEFAULT = 50;

/** Clamps to 0–100 and rounds to 1 decimal; returns null for non-numbers. */
export function validCoverPos(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

/** CSS `object-position` value for a stored focal point (defaults to center). */
export function coverObjectPosition(x?: number | null, y?: number | null): string {
  const px = validCoverPos(x) ?? COVER_POS_DEFAULT;
  const py = validCoverPos(y) ?? COVER_POS_DEFAULT;
  return `${px}% ${py}%`;
}

/** The two focal-point axes the picker edits. */
export type CoverPos = { x: number; y: number };

/** What gets saved for a choice: no cover means no focal point to remember. */
export function coverSaveValues(selectedId: string | null, pos: CoverPos) {
  return {
    coverFileId: selectedId,
    coverPosX: selectedId === null ? null : pos.x,
    coverPosY: selectedId === null ? null : pos.y,
  };
}

/**
 * Whether the choice differs from what is already saved. If it is the same, Save stays disabled: no point saving an identical value.
 * A different photo is a change; the same photo is a change only if its focal point moved (and with no cover there is no focal point).
 */
export function coverHasChanges(selectedId: string | null, savedId: string | null | undefined, pos: CoverPos, savedPos: CoverPos): boolean {
  const posChanged = pos.x !== savedPos.x || pos.y !== savedPos.y;
  return selectedId !== (savedId ?? null) || (selectedId !== null && posChanged);
}

/** Warnings for the chosen photo: narrower than the recommended minimum (may look blurry on large screens), or a portrait (heavily cropped in the banner). */
export function coverWarnings(photo: { width?: number | null; height?: number | null } | null) {
  return {
    lowRes: !!photo?.width && photo.width < COVER_RECOMMENDED.minWidth,
    portrait: !!photo?.width && !!photo?.height && photo.height > photo.width,
  };
}
