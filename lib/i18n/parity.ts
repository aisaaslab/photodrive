/** Problems with one language's dictionary compared with English: missing or extra keys, empty text, different {placeholders}. */
const placeholders = (s: string) => (s.match(/\{[A-Za-z0-9_]+\}/g) ?? []).sort().join(",");

function flatten(value: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof value === "string") out[prefix] = value;
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

export function dictionaryProblems(reference: unknown, other: unknown): string[] {
  const ref = flatten(reference);
  const got = flatten(other);
  const problems: string[] = [];
  for (const key of Object.keys(ref)) {
    if (!(key in got)) { problems.push(`missing: ${key}`); continue; }
    if (got[key].trim() === "" && ref[key].trim() !== "") problems.push(`empty: ${key}`);
    else if (placeholders(got[key]) !== placeholders(ref[key])) problems.push(`placeholders differ: ${key}`);
  }
  for (const key of Object.keys(got)) if (!(key in ref)) problems.push(`extra: ${key}`);
  return problems;
}
