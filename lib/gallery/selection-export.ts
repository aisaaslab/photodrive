/**
 * The client's favourites as a plain list of file names, for pasting into Lightroom or a spreadsheet (S10-01). Pure: used by the owner's
 * export endpoint and by the "Copy filenames" button, so both give exactly the same text.
 */
export type ExportFormat = "txt" | "csv";
export type ExportExt = "keep" | "strip";
export type ExportItem = { id: string; name: string };

/** A file name without its last extension ("IMG_001.jpg" → "IMG_001"); a name with no extension, or only a leading dot, is unchanged. */
export const stripExtension = (name: string) => name.replace(/(?!^)\.[A-Za-z0-9_-]{1,8}$/, "");

/** The names in the order the owner sees them (natural order, so IMG_2 comes before IMG_10). */
export function exportNames(items: ExportItem[], ext: ExportExt): string[] {
  const names = items.map((i) => (i.name || i.id).trim()).filter(Boolean);
  const out = ext === "strip" ? names.map(stripExtension) : names;
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** `txt`: one name per line. `csv`: a header row and one name per row (quoted when needed, so it opens correctly in a spreadsheet). */
export function formatExport(items: ExportItem[], format: ExportFormat, ext: ExportExt): string {
  const names = exportNames(items, ext);
  if (format === "csv") return ["filename", ...names.map(csvCell)].join("\r\n") + "\r\n";
  return names.join("\n");
}

export const parseFormat = (v: string | null): ExportFormat => (v === "csv" ? "csv" : "txt");
export const parseExt = (v: string | null): ExportExt => (v === "strip" ? "strip" : "keep");
