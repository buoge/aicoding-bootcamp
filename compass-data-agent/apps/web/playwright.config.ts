import { defineConfig } from "@playwright/test";
const port = Number(process.env.WEB_TEST_PORT ?? 3010);
const baseURL = `http://127.0.0.1:${port}`;
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid WEB_TEST_PORT");
const database = process.env.WEB_TEST_DATABASE_URL;
if (!database || !/^\/compass_web_test_[a-z0-9_]+$/.test(new URL(database).pathname))
  throw new Error("A dedicated WEB_TEST_DATABASE_URL is required");
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  outputDir: "../../work/995-playwright",
  reporter: [["list"], ["json", { outputFile: "../../work/995-playwright-results.json" }]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer:
    process.env.WEB_TEST_EXTERNAL_SERVER === "true"
      ? undefined
      : {
          command: `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
          url: `${baseURL}/healthz`,
          reuseExistingServer: false,
          timeout: 120000,
          env: {
            WEB_DATABASE_URL: database,
            WEB_PUBLIC_ORIGIN: baseURL,
            WEB_AUTH_ALLOW_LOCAL_HTTP: "true",
            COMPASS_DEMO_ENABLED: "false",
          },
        },
});
