import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // `server-only` throws unless the bundler is building a server component; outside Next (tests) it is an empty module.
  resolve: { alias: { "@": path.resolve(__dirname), "server-only": path.resolve(__dirname, "lib/shims/server-only.ts") } },
  test: {
    environment: "node",
    // Test-mode placeholder so Stripe-backed code can construct a client; no network calls are made.
    env: { STRIPE_SECRET_KEY: "sk_test_unit_tests", APP_ENV: "local" },
    include: ["tests/emu/**/*.test.ts", "tests/**/*.emu.test.ts"],
    fileParallelism: false, // suites share one emulator instance
    // Contending transactions retry with back-off in the emulator; the concurrency tests
    // take several seconds on a slow CI runner.
    testTimeout: 30_000,
  },
});
