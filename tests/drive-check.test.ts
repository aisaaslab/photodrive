import { describe, expect, it } from "vitest";
import { checkDriveFolder } from "@/lib/drive/check";

type Reply = { status?: number; body?: unknown } | "throw";
/** A fake Drive: replies in order, and records the URLs asked. */
function drive(...replies: Reply[]) {
  const urls: string[] = [];
  const fn = async (url: string) => {
    urls.push(url);
    const r = replies.shift() ?? { status: 500 };
    if (r === "throw") throw new Error("network");
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.body };
  };
  return { fn, urls };
}
const FOLDER = { body: { id: "F", name: "Wedding", mimeType: "application/vnd.google-apps.folder" } };
const files = (...mimes: string[]) => ({ body: { files: mimes.map((m, i) => ({ id: `id${i}`, mimeType: m })) } });
const run = (d: ReturnType<typeof drive>) => checkDriveFolder("F", "KEY", d.fn);

describe("checkDriveFolder", () => {
  it("a shared folder with photos: counts photos, videos and sub-folders", async () => {
    const d = drive(FOLDER, files("image/jpeg", "image/png", "video/mp4", "application/vnd.google-apps.folder", "application/pdf"));
    expect(await run(d)).toEqual({ status: "ok", name: "Wedding", photos: 2, videos: 1, subfolders: 1, capped: false, inSubfolders: false });
    expect(d.urls[0]).toContain("/files/F");
    expect(d.urls[0]).toContain("key=KEY");
  });

  it("not shared (Drive answers 404 to the app's key) and a missing folder are the same answer", async () => {
    expect(await run(drive({ status: 404 }))).toEqual({ status: "notFound" });
  });

  it("a link to a single file is not a folder", async () => {
    expect(await run(drive({ body: { name: "a.jpg", mimeType: "image/jpeg" } }))).toEqual({ status: "notFolder" });
  });

  it("quota, key or network trouble is 'unavailable', never 'not found'", async () => {
    expect(await run(drive({ status: 403 }))).toEqual({ status: "unavailable" });
    expect(await run(drive({ status: 500 }))).toEqual({ status: "unavailable" });
    expect(await run(drive("throw"))).toEqual({ status: "unavailable" });
    expect(await run(drive(FOLDER, { status: 403 }))).toEqual({ status: "unavailable" });
  });

  it("an empty folder", async () => {
    expect(await run(drive(FOLDER, files()))).toEqual({ status: "empty", name: "Wedding" });
  });

  it("only files the gallery cannot show (documents)", async () => {
    expect(await run(drive(FOLDER, files("application/pdf", "text/plain")))).toEqual({ status: "unsupported", name: "Wedding" });
  });

  it("no photos at the top, but some in a sub-folder: usable", async () => {
    const d = drive(FOLDER, { body: { files: [{ id: "S1", mimeType: "application/vnd.google-apps.folder" }, { id: "S2", mimeType: "application/vnd.google-apps.folder" }] } }, { body: { files: [] } }, { body: { files: [{ id: "p" }] } });
    expect(await run(d)).toMatchObject({ status: "ok", photos: 0, subfolders: 2, inSubfolders: true });
  });

  it("sub-folders that are all empty: empty", async () => {
    const d = drive(FOLDER, { body: { files: [{ id: "S1", mimeType: "application/vnd.google-apps.folder" }] } }, { body: { files: [] } });
    expect(await run(d)).toEqual({ status: "empty", name: "Wedding" });
  });

  it("a folder bigger than one Drive page says the counts are lower bounds", async () => {
    const d = drive(FOLDER, { body: { files: [{ id: "a", mimeType: "image/jpeg" }], nextPageToken: "more" } });
    expect(await run(d)).toMatchObject({ status: "ok", photos: 1, capped: true });
  });

  it("probes at most five sub-folders", async () => {
    const sub = Array.from({ length: 9 }, (_, i) => ({ id: `S${i}`, mimeType: "application/vnd.google-apps.folder" }));
    const d = drive(FOLDER, { body: { files: sub } }, ...Array.from({ length: 9 }, () => ({ body: { files: [] } })));
    await run(d);
    expect(d.urls).toHaveLength(2 + 5);
  });
});
