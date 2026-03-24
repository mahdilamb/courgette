import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // features share backend state
  retries: 0,
  use: {
    baseURL: "http://localhost:8642",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "uv run python -m courgette_ui --no-open",
    port: 8642,
    cwd: "..",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
