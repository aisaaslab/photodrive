/**
 * Stand-in for the `server-only` package outside Next.js (S4-08).
 *
 * Server modules start with `import "server-only"`. Inside a Next build that import is the real guard: bundling such a module into
 * a Client Component fails the build ("'server-only' cannot be imported from a Client Component module"). Everywhere else (Vitest,
 * the `tsx` maintenance scripts) there is no client bundle to protect, and the real package would throw, so `tsconfig.json` and the
 * Vitest configs point the specifier at this empty module. (Next recognises the import by its name, so the guard still fires in a
 * build; that is tested by tests/server-only-guard.test.ts.)
 */
export {};
