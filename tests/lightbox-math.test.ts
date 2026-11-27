import { describe, expect, it } from "vitest";
import {
  DOUBLE_TAP_ZOOM, MAX_ZOOM, UNZOOMED, clampPan, isDoubleTap, pinchedTo, swipeAction, toggledZoom, zoomedBy,
} from "@/lib/gallery/lightbox-math";

describe("lightbox zoom and gesture rules (S5-10)", () => {
  it("the pan cannot leave the zoomed image: at 2x a 400x300 image can move 200 and 150 px each way", () => {
    expect(clampPan(2, 500, -500, 400, 300)).toEqual({ x: 200, y: -150 });
    expect(clampPan(2, 10, -10, 400, 300)).toEqual({ x: 10, y: -10 });
    expect(clampPan(1, 50, 50, 400, 300)).toEqual({ x: 0, y: 0 }); // unzoomed: nowhere to go
    expect(clampPan(3, 0, 0, 0, 0)).toEqual({ x: 0, y: 0 }); // image not measured yet
  });

  it("key and wheel steps multiply the scale, stop at 4x, and snap back to 1x near it", () => {
    expect(zoomedBy(UNZOOMED, 1.5, 400, 300)).toEqual({ s: 1.5, x: 0, y: 0 });
    expect(zoomedBy({ s: 3, x: 0, y: 0 }, 1.5, 400, 300).s).toBe(MAX_ZOOM);
    expect(zoomedBy({ s: 1.5, x: 100, y: 0 }, 1 / 1.5, 400, 300)).toEqual(UNZOOMED);
    expect(zoomedBy({ s: 1.5, x: 0, y: 0 }, 1 / MAX_ZOOM, 400, 300)).toEqual(UNZOOMED); // the 0 key
    expect(zoomedBy(UNZOOMED, 1.01, 400, 300)).toEqual(UNZOOMED); // within 2% of 1x
    expect(zoomedBy(UNZOOMED, 0.5, 400, 300)).toEqual(UNZOOMED); // never below 1x
  });

  it("zooming keeps the pan inside the new bounds", () => {
    expect(zoomedBy({ s: 2, x: 190, y: 0 }, 1.1, 400, 300)).toEqual({ s: 2.2, x: 190, y: 0 }); // an existing pan within the (larger) limit is kept as it is
    expect(zoomedBy({ s: 3, x: 400, y: 300 }, 1 / 1.5, 400, 300)).toEqual({ s: 2, x: 200, y: 150 }); // and shrinks with it
  });

  it("the button and double-tap toggle between 1x and 2.5x", () => {
    expect(toggledZoom(UNZOOMED)).toEqual({ s: DOUBLE_TAP_ZOOM, x: 0, y: 0 });
    expect(toggledZoom({ s: 2.5, x: 30, y: 10 })).toEqual(UNZOOMED);
    expect(toggledZoom({ s: 1.01, x: 0, y: 0 })).toEqual(UNZOOMED); // anything above 1x counts as zoomed in
  });

  it("a pinch scales with the finger distance, is clamped to 1x..4x, and returns to exactly 1x when pinched in", () => {
    const pan = { x: 0, y: 0 };
    expect(pinchedTo(1, 100, 200, pan, 400, 300)).toEqual({ s: 2, x: 0, y: 0 });
    expect(pinchedTo(1, 100, 900, pan, 400, 300).s).toBe(MAX_ZOOM);
    expect(pinchedTo(2, 100, 40, pan, 400, 300)).toEqual(UNZOOMED);
    expect(pinchedTo(1, 100, 100, pan, 400, 300)).toEqual(UNZOOMED);
  });

  it("swipes: horizontal more than 50 px navigates, downward more than 90 px closes, a mouse never swipes", () => {
    expect(swipeAction(-80, 5, "touch")).toBe("next");
    expect(swipeAction(80, 5, "pen")).toBe("prev");
    expect(swipeAction(-40, 0, "touch")).toBeNull(); // too short
    expect(swipeAction(-80, 70, "touch")).toBeNull(); // not mostly horizontal
    expect(swipeAction(5, 120, "touch")).toBe("close");
    expect(swipeAction(5, -120, "touch")).toBeNull(); // upwards does nothing
    expect(swipeAction(80, 120, "touch")).toBeNull(); // diagonal
    expect(swipeAction(-200, 0, "mouse")).toBeNull();
    expect(swipeAction(0, 200, "mouse")).toBeNull();
  });

  it("a double tap is two taps within 300 ms and 30 px", () => {
    const first = { t: 1000, x: 100, y: 100 };
    expect(isDoubleTap(first, 1299, 110, 100)).toBe(true);
    expect(isDoubleTap(first, 1300, 100, 100)).toBe(false);
    expect(isDoubleTap(first, 1100, 100, 131)).toBe(false);
    expect(isDoubleTap(null, 1100, 100, 100)).toBe(false);
  });
});
