import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    // Test-mode placeholder so Stripe-backed code can construct a client; no network calls are made.
    env: { STRIPE_SECRET_KEY: "sk_test_unit_tests", APP_ENV: "local" },
    include: ["tests/**/*.test.ts"],
    // Emulator-backed suites (tests/emu/** or *.emu.test.ts) run via `npm run test:emu`.
    exclude: ["tests/emu/**", "tests/**/*.emu.test.ts", "node_modules/**"],
  },
});
