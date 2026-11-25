import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Emulator-backed suites (tests/emu/** or *.emu.test.ts) run via `npm run test:emu`.
    exclude: ["tests/emu/**", "tests/**/*.emu.test.ts", "node_modules/**"],
  },
});
