import { describe, expect, it } from "vitest";
import { COVER_POS_DEFAULT, coverHasChanges, coverSaveValues, coverWarnings } from "@/lib/gallery/cover-position";

const C = { x: COVER_POS_DEFAULT, y: COVER_POS_DEFAULT };

describe("cover picker rules (S5-10)", () => {
  it("saves the chosen photo with its focal point; no cover means no focal point", () => {
    expect(coverSaveValues("file1", { x: 50, y: 52 })).toEqual({ coverFileId: "file1", coverPosX: 50, coverPosY: 52 });
    expect(coverSaveValues(null, { x: 10, y: 90 })).toEqual({ coverFileId: null, coverPosX: null, coverPosY: null });
  });

  it("Save is enabled only for a real change", () => {
    expect(coverHasChanges("a", "a", C, C)).toBe(false); // nothing changed
    expect(coverHasChanges("b", "a", C, C)).toBe(true); // another photo
    expect(coverHasChanges("a", "a", { x: 50, y: 52 }, C)).toBe(true); // same photo, moved
    expect(coverHasChanges(null, "a", C, C)).toBe(true); // removing the cover
    expect(coverHasChanges(null, null, C, C)).toBe(false); // no cover before and after
    expect(coverHasChanges(null, undefined, C, C)).toBe(false); // an unset cover is no cover
    expect(coverHasChanges(null, null, { x: 10, y: 10 }, C)).toBe(false); // a focal point means nothing without a cover
    expect(coverHasChanges("a", null, C, C)).toBe(true); // first cover
  });

  it("warns about photos under 1600 px wide and about portraits, and about nothing for a good one", () => {
    expect(coverWarnings({ width: 1599, height: 900 })).toEqual({ lowRes: true, portrait: false });
    expect(coverWarnings({ width: 1600, height: 900 })).toEqual({ lowRes: false, portrait: false });
    expect(coverWarnings({ width: 2000, height: 3000 })).toEqual({ lowRes: false, portrait: true });
    expect(coverWarnings({ width: 800, height: 1200 })).toEqual({ lowRes: true, portrait: true });
    expect(coverWarnings({ width: 2000, height: 2000 }).portrait).toBe(false); // square is not a portrait
    expect(coverWarnings({ height: 3000 })).toEqual({ lowRes: false, portrait: false }); // unknown width: no guess
    expect(coverWarnings(null)).toEqual({ lowRes: false, portrait: false });
  });
});
