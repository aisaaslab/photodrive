// Preloaded into the Next server: answers Google Drive calls locally, so a real production build can serve galleries offline.
const real = globalThis.fetch;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const FILES = [
  { id: "1DriveImageFileIdAAAAAAAAAAAAAAAAAAA", name: "a.jpg", mimeType: "image/jpeg", thumbnailLink: "https://lh3.googleusercontent.com/AAAAsecret=s220", imageMediaMetadata: { width: 600, height: 400 } },
  { id: "1DriveImageFileIdBBBBBBBBBBBBBBBBBBB", name: "b.jpg", mimeType: "image/jpeg", thumbnailLink: "https://lh3.googleusercontent.com/BBBBsecret=s220", imageMediaMetadata: { width: 400, height: 600 } },
  { id: "1DriveVideoFileIdCCCCCCCCCCCCCCCCCCC", name: "c.mp4", mimeType: "video/mp4", thumbnailLink: "https://lh3.googleusercontent.com/CCCCsecret=s220", videoMediaMetadata: { width: 640, height: 360 } },
];
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://www.googleapis.com/drive/v3/files?")) {
    const q = new URL(url).searchParams.get("q") || "";
    const body = q.includes("google-apps.folder") ? { files: [] } : { files: FILES };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.startsWith("https://drive.google.com/thumbnail")) return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
  if (url.startsWith("https://www.googleapis.com/drive/v3/files/")) return new Response(PNG, { status: 200, headers: { "content-type": "video/mp4", "content-length": String(PNG.length) } });
  return real(input, init);
};
