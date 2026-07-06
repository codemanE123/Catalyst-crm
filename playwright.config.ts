import { defineConfig } from "@playwright/test";

const E2E_ENV_VARS = [
  "E2E_BASE_URL",
  "E2E_USER_EMAIL",
  "E2E_USER_PASSWORD"
] as const;

function missingE2eEnvVars(): string[] {
  return E2E_ENV_VARS.filter((name) => {
    const value = process.env[name];

    if (name === "E2E_USER_PASSWORD") {
      return value === undefined || value === "";
    }

    return !value?.trim();
  });
}

const missing = missingE2eEnvVars();

if (missing.length > 0) {
  console.log(
    `\nE2E smoke tests will be skipped: set ${missing.join(", ")} to run auth smoke tests against a deployed environment.\n`
  );
}

const baseURL = process.env.E2E_BASE_URL?.trim();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: baseURL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry"
  }
});
