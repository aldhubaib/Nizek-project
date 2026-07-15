import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.HARNESS_PORT || 4173);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  // Notification banners are origin-global in headed browsers — tests within a
  // file must run sequentially or they see each other's banners.
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: "node tests/e2e/harness/server.mjs",
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
