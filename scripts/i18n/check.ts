/**
 * `npm run i18n:check`: every language has exactly the keys of English, no empty text, and the same {placeholders} (S5-06).
 * Exits 1 listing the problems, so CI fails when a language falls behind.
 */
import { dictionaryProblems } from "../../lib/i18n/parity";
import { LANGUAGES } from "../../lib/i18n/languages";
import { loadDictionary } from "../../lib/i18n/load";

async function main() {
  const en = await loadDictionary("en");
  let failed = 0;
  for (const lang of LANGUAGES) {
    if (lang === "en") continue;
    const problems = dictionaryProblems(en, await loadDictionary(lang));
    if (problems.length) {
      failed += problems.length;
      console.error(`\n${lang}: ${problems.length} problem(s)`);
      for (const p of problems.slice(0, 40)) console.error(`  ${p}`);
    } else console.log(`${lang}: ok`);
  }
  if (failed) process.exit(1);
}
main();
