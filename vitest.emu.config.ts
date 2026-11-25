import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    include: ["tests/emu/**/*.test.ts", "tests/**/*.emu.test.ts"],
    fileParallelism: false, // suites share one emulator instance
  },
});
