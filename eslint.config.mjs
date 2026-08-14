import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // These React 19 compiler rules fire on code that behaves correctly here:
    // Date.now() read during render to seed a countdown, and a ref read inside a
    // pointer handler that the analysis attributes to render. They are still
    // worth seeing, so they stay on as warnings — but they must not fail
    // `npm run lint`, or the command stops being a useful gate for the real
    // problems you introduce later.
    rules: {
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
