import { describe, expect, it } from "vitest";
import type { DriveFile } from "@/lib/drive/types";
import { countLabel, filterAndSort, inFolder, isImage, isVideo, viewKey } from "@/lib/gallery/view";

const f = (id: string, name: string, mimeType = "image/jpeg", folder?: string): DriveFile => ({ id, name, mimeType, ...(folder ? { folder } : {}) });
const photos = [f("1", "IMG_10.jpg"), f("2", "IMG_2.jpg"), f("3", "clip.mp4", "video/mp4"), f("4", "Sub_a.jpg", "image/png", "Sub"), f("5", "IMG_1.JPG")];
const view = (over: Partial<Parameters<typeof filterAndSort>[1]> = {}, list = photos) =>
  filterAndSort(list, { filter: "all", favorites: new Set(), search: "", sort: "default", ...over }).map((p) => p.id);

describe("gallery view rules (S5-08)", () => {
  it("tells images from videos", () => {
    expect(photos.map(isImage)).toEqual([true, true, false, true, true]);
    expect(photos.map(isVideo)).toEqual([false, false, true, false, false]);
  });

  it("a folder shows only its own files; no folder shows everything", () => {
    expect(inFolder(photos, "Sub").map((p) => p.id)).toEqual(["4"]);
    expect(inFolder(photos, null)).toBe(photos);
    expect(inFolder(photos, "Nope")).toEqual([]);
  });

  it("type filters", () => {
    expect(view({ filter: "photos" })).toEqual(["1", "2", "4", "5"]);
    expect(view({ filter: "videos" })).toEqual(["3"]);
    expect(view({ filter: "favorites", favorites: new Set(["2", "3", "gone"]) })).toEqual(["2", "3"]);
  });

  it("the default order is the order Drive gave", () => {
    expect(view()).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("search matches the file name, ignoring case, after the filter (so Favorites + search work together)", () => {
    expect(view({ search: "img_" })).toEqual(["1", "2", "5"]);
    expect(view({ search: "IMG_1" })).toEqual(["1", "5"]);
    expect(view({ search: "img", filter: "favorites", favorites: new Set(["2", "4"]) })).toEqual(["2"]);
    expect(view({ search: "zzz" })).toEqual([]);
  });

  it("sorts by name with numbers in human order (IMG_2 before IMG_10), both ways, without touching the input", () => {
    const before = photos.map((p) => p.id);
    expect(view({ sort: "name" })).toEqual(["3", "5", "2", "1", "4"]);
    expect(view({ sort: "nameDesc" })).toEqual(["4", "1", "2", "5", "3"]);
    expect(photos.map((p) => p.id)).toEqual(before);
  });

  it("the count label does not call videos photos", () => {
    const w = { photo: "photo", photos: "photos", video: "video", videos: "videos" };
    expect(countLabel([photos[0]], w)).toBe("1 photo");
    expect(countLabel([photos[0], photos[1]], w)).toBe("2 photos");
    expect(countLabel([photos[2]], w)).toBe("1 video");
    expect(countLabel(photos, w)).toBe("4 photos · 1 video");
    expect(countLabel([], w)).toBe("0 photos");
  });

  it("the progressive window restarts when any view setting changes", () => {
    const base = viewKey("all", null, "", "default");
    expect(viewKey("photos", null, "", "default")).not.toBe(base);
    expect(viewKey("all", "Sub", "", "default")).not.toBe(base);
    expect(viewKey("all", null, "x", "default")).not.toBe(base);
    expect(viewKey("all", null, "", "name")).not.toBe(base);
    expect(viewKey("all", null, "", "default")).toBe(base);
  });
});
