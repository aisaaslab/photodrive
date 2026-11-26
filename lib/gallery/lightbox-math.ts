/**
 * The lightbox's zoom and gesture rules (S5-10), as pure functions so they can be tested without a browser. Pinch (two fingers),
 * double-tap, Ctrl/⌘ + wheel, the top-bar button and the + / - / 0 keys all drive one zoom state: a scale `s` plus a pan offset
 * (x, y) in px.
 */
export const MAX_ZOOM = 4;
export const DOUBLE_TAP_ZOOM = 2.5;

export type ZoomValue = { s: number; x: number; y: number };
/** The zoom is keyed by photo id, so moving to another photo starts at 1x without an effect. */
export type Zoom = ZoomValue & { id: string };

export const UNZOOMED: ZoomValue = { s: 1, x: 0, y: 0 };

/** Keep the pan inside the zoomed image's bounds: the image cannot be dragged past its own edges. */
export function clampPan(s: number, x: number, y: number, width: number, height: number): { x: number; y: number } {
  const mx = ((s - 1) * width) / 2;
  const my = ((s - 1) * height) / 2;
  return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
}

/** One zoom step by `factor` (the keys and the wheel): clamped to 1x..4x, and anything within 2% of 1x snaps back to 1x. */
export function zoomedBy(z: ZoomValue, factor: number, width: number, height: number): ZoomValue {
  const s = Math.min(MAX_ZOOM, Math.max(1, z.s * factor));
  return s <= 1.02 ? UNZOOMED : { s, ...clampPan(s, z.x, z.y, width, height) };
}

/** The top-bar button and a double-tap: zoomed in goes back to 1x, otherwise jump to 2.5x. */
export const toggledZoom = (z: ZoomValue): ZoomValue => (z.s > 1 ? UNZOOMED : { s: DOUBLE_TAP_ZOOM, x: 0, y: 0 });

/** Two-finger pinch: the scale follows the distance between the fingers relative to where the gesture started. */
export function pinchedTo(startScale: number, startDist: number, dist: number, startPan: { x: number; y: number }, width: number, height: number): ZoomValue {
  const s = Math.min(MAX_ZOOM, Math.max(1, (startScale * dist) / startDist));
  return s <= 1 ? UNZOOMED : { s, ...clampPan(s, startPan.x, startPan.y, width, height) };
}

/**
 * What a finished one-finger swipe means (touch or pen, only while not zoomed): a mostly horizontal move of more than 50 px goes to
 * the next or previous photo, a mostly downward move of more than 90 px closes. A mouse never swipes.
 */
export function swipeAction(dx: number, dy: number, pointerType: string): "next" | "prev" | "close" | null {
  if (pointerType === "mouse") return null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) return dx < 0 ? "next" : "prev";
  if (dy > 90 && dy > Math.abs(dx) * 1.5) return "close";
  return null;
}

/** A second tap within 300 ms and 30 px of the first. */
export function isDoubleTap(last: { t: number; x: number; y: number } | null, now: number, x: number, y: number): boolean {
  return !!last && now - last.t < 300 && Math.hypot(x - last.x, y - last.y) < 30;
}
