import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Emulator-backed suites live in tests/emu and run via `npm run test:emu`.
    exclude: ["tests/emu/**", "node_modules/**"],
  },
});
