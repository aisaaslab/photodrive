import { describe, expect, it } from "vitest";
import { exportNames, formatExport, parseExt, parseFormat, stripExtension } from "@/lib/gallery/selection-export";

const items = [
  { id: "3", name: "IMG_10.jpg" },
  { id: "1", name: "IMG_2.JPG" },
  { id: "2", name: "wedding, final \"A\".png" },
];

describe("stripExtension", () => {
  it("removes only the last extension", () => {
    expect(stripExtension("IMG_001.jpg")).toBe("IMG_001");
    expect(stripExtension("a.b.cr2")).toBe("a.b");
  });
  it("leaves names with no extension alone", () => {
    expect(stripExtension("README")).toBe("README");
    expect(stripExtension(".hidden")).toBe(".hidden");
    expect(stripExtension("v1.2 final")).toBe("v1.2 final");
  });
});

describe("exportNames", () => {
  it("sorts naturally, so IMG_2 comes before IMG_10", () => {
    expect(exportNames(items, "keep").slice(0, 2)).toEqual(["IMG_2.JPG", "IMG_10.jpg"]);
  });
  it("strips extensions on request", () => {
    expect(exportNames(items, "strip")).toEqual(["IMG_2", "IMG_10", "wedding, final \"A\""]);
  });
  it("falls back to the file id for a nameless photo and drops blanks", () => {
    expect(exportNames([{ id: "abc", name: "" }, { id: "x", name: "  " }, { id: "y", name: "ok.jpg" }], "keep")).toEqual(["abc", "ok.jpg"]);
  });
});

describe("formatExport", () => {
  it("txt is exactly the names, one per line", () => {
    expect(formatExport(items, "txt", "keep")).toBe("IMG_2.JPG\nIMG_10.jpg\nwedding, final \"A\".png");
  });
  it("csv has a header, CRLF rows and quotes cells that need it", () => {
    expect(formatExport(items, "csv", "keep")).toBe('filename\r\nIMG_2.JPG\r\nIMG_10.jpg\r\n"wedding, final ""A"".png"\r\n');
  });
  it("an empty selection is an empty text or a header-only csv", () => {
    expect(formatExport([], "txt", "keep")).toBe("");
    expect(formatExport([], "csv", "keep")).toBe("filename\r\n");
  });
});

describe("query parsing", () => {
  it("defaults to txt and keep for anything unexpected", () => {
    expect(parseFormat(null)).toBe("txt");
    expect(parseFormat("csv")).toBe("csv");
    expect(parseFormat("xml")).toBe("txt");
    expect(parseExt("strip")).toBe("strip");
    expect(parseExt("x")).toBe("keep");
  });
});
