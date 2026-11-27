import { describe, expect, it } from "vitest";
import { uniqueNames, zipToBlob } from "@/lib/shared/zip";

/** Reads a zip's central directory: name, compression method and stored bytes of each entry. */
async function readZip(blob: Blob) {
  const buf = Buffer.from(await blob.arrayBuffer());
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd).toBeGreaterThan(-1);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: { name: string; method: number; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    out.push({ name, method, data: buf.subarray(dataStart, dataStart + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe("zip helper (S5-11)", () => {
  it("builds a valid zip with every file stored (not compressed) and its bytes intact", async () => {
    const a = new Uint8Array([1, 2, 3, 250, 251, 252]);
    const blob = await zipToBlob([
      { name: "a.jpg", blob: new Blob([a]) },
      { name: "Ürlaub ü.txt", blob: new Blob(["héllo wörld"]) },
      { name: "empty.bin", blob: new Blob([]) },
    ]);
    const entries = await readZip(blob);
    expect(entries.map((e) => e.name)).toEqual(["a.jpg", "Ürlaub ü.txt", "empty.bin"]);
    expect(entries.every((e) => e.method === 0)).toBe(true); // STORE
    expect([...entries[0].data]).toEqual([...a]);
    expect(entries[1].data.toString("utf8")).toBe("héllo wörld");
    expect(entries[2].data.length).toBe(0);
  });

  it("an empty list is still a valid, empty zip", async () => {
    expect(await readZip(await zipToBlob([]))).toEqual([]);
  });

  it("two photos with the same name are both kept (the old library silently overwrote one)", async () => {
    const entries = await readZip(await zipToBlob([
      { name: "IMG_1.jpg", blob: new Blob(["one"]) },
      { name: "IMG_1.jpg", blob: new Blob(["two"]) },
      { name: "img_1.JPG", blob: new Blob(["three"]) },
    ]));
    expect(entries.map((e) => e.name)).toEqual(["IMG_1.jpg", "IMG_1 (2).jpg", "img_1 (3).JPG"]);
    expect(entries.map((e) => e.data.toString())).toEqual(["one", "two", "three"]);
  });

  it("uniqueNames leaves distinct names alone and handles names without an extension", () => {
    expect(uniqueNames(["a.jpg", "b.jpg"])).toEqual(["a.jpg", "b.jpg"]);
    expect(uniqueNames(["notes", "notes", "notes"])).toEqual(["notes", "notes (2)", "notes (3)"]);
    expect(uniqueNames([".hidden", ".hidden"])).toEqual([".hidden", ".hidden (2)"]);
  });
});
