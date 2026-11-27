/**
 * Builds a zip in the browser from files already downloaded (S5-11: one zip library, `client-zip`, for the server download route and
 * the browser). Entries are stored, not compressed: photos and videos are already compressed, so deflating them only burns CPU.
 * The library is loaded on demand so it is not shipped on every gallery view.
 */
export type ZipEntry = { name: string; blob: Blob };

/** `a.jpg` taken -> `a (2).jpg`, so two photos with the same name in different folders are both kept instead of one overwriting the other. */
export function uniqueNames(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
      const dot = name.lastIndexOf(".");
      candidate = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}

export async function zipToBlob(entries: ZipEntry[]): Promise<Blob> {
  const { downloadZip } = await import("client-zip");
  const names = uniqueNames(entries.map((e) => e.name));
  return downloadZip(entries.map((e, i) => ({ name: names[i], input: e.blob, lastModified: new Date() }))).blob();
}
