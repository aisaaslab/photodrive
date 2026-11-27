// Preloaded into the Next server: answers Google Drive calls locally, so a real production build can serve galleries offline.
const real = globalThis.fetch;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const FILES = [
  { id: "1DriveImageFileIdAAAAAAAAAAAAAAAAAAA", name: "a.jpg", mimeType: "image/jpeg", thumbnailLink: "https://lh3.googleusercontent.com/AAAAsecret=s220", imageMediaMetadata: { width: 600, height: 400 } },
  { id: "1DriveImageFileIdBBBBBBBBBBBBBBBBBBB", name: "b.jpg", mimeType: "image/jpeg", thumbnailLink: "https://lh3.googleusercontent.com/BBBBsecret=s220", imageMediaMetadata: { width: 400, height: 600 } },
  { id: "1DriveVideoFileIdCCCCCCCCCCCCCCCCCCC", name: "c.mp4", mimeType: "video/mp4", thumbnailLink: "https://lh3.googleusercontent.com/CCCCsecret=s220", videoMediaMetadata: { width: 640, height: 360 } },
];
// A large gallery for behaviour checks: folder BIG has 130 files (images and a few videos) and one subfolder with 5 more.
const BIG = "BIGFOLDER000000000000000000000000";
const SUB = "SUBFOLDER00000000000000000000000";
const bigFiles = Array.from({ length: 130 }, (_, i) => {
  const n = String(i + 1).padStart(3, "0");
  const video = i % 40 === 39;
  return { id: `BIGFILE${n}`.padEnd(30, "x"), name: video ? `CLIP_${n}.mp4` : `IMG_${n}.jpg`, mimeType: video ? "video/mp4" : "image/jpeg", thumbnailLink: `https://lh3.googleusercontent.com/BIG${n}=s220`, ...(video ? { videoMediaMetadata: { width: 640, height: 360 } } : { imageMediaMetadata: { width: 600 + (i % 3) * 100, height: 400 + (i % 4) * 50 } }) };
});
const subFiles = Array.from({ length: 5 }, (_, i) => ({ id: `SUBFILE${i + 1}`.padEnd(30, "y"), name: `SUB_${i + 1}.jpg`, mimeType: "image/jpeg", thumbnailLink: `https://lh3.googleusercontent.com/SUB${i + 1}=s220`, imageMediaMetadata: { width: 600, height: 400 } }));
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://www.googleapis.com/drive/v3/files?")) {
    const q = new URL(url).searchParams.get("q") || "";
    const parent = /"([^"]+)" in parents/.exec(q)?.[1];
    const isFolderQuery = q.includes("google-apps.folder");
    let body;
    if (parent === BIG) body = isFolderQuery ? { files: [{ id: SUB, name: "Sub" }] } : { files: bigFiles };
    else if (parent === SUB) body = isFolderQuery ? { files: [] } : { files: subFiles };
    else body = isFolderQuery ? { files: [] } : { files: FILES };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }
  // The folder check (S10-03) asks for a folder's name and type: every id here is a shared folder.
  if (url.startsWith("https://www.googleapis.com/drive/v3/files/") && new URL(url).searchParams.get("fields") === "id,name,mimeType") {
    return new Response(JSON.stringify({ id: "folder", name: "Test folder", mimeType: "application/vnd.google-apps.folder" }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.startsWith("https://drive.google.com/thumbnail")) return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
  if (url.startsWith("https://www.googleapis.com/drive/v3/files/")) return new Response(PNG, { status: 200, headers: { "content-type": "video/mp4", "content-length": String(PNG.length) } });
  return real(input, init);
};
