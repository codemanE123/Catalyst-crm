import { expect, test } from "@playwright/test";

import {
  E2E_SKIP_MESSAGE,
  getE2eCredentials,
  loadE2eEnvFiles,
  validateE2eCredentials
} from "./env";
import {
  getLoginErrorLocator,
  readVisibleLoginErrors,
  signInViaLoginForm
} from "./helpers/auth";

loadE2eEnvFiles();

const e2eCredentials = getE2eCredentials();
const e2eValidationError = e2eCredentials
  ? validateE2eCredentials(e2eCredentials)
  : null;

test.describe("Pilot Launch auth smoke", () => {
  test.beforeEach(() => {
    test.skip(!e2eCredentials, E2E_SKIP_MESSAGE);
    test.skip(
      Boolean(e2eValidationError),
      e2eValidationError ?? "Invalid E2E credentials."
    );
  });

  test("/login loads", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(getLoginErrorLocator(page)).toHaveCount(0);
  });

  test("authenticated user can sign in", async ({ page }) => {
    const { email, password } = e2eCredentials!;

    await signInViaLoginForm(page, email, password);
    await expect(page).toHaveURL((url) => new URL(url).pathname === "/");
  });

  test("dashboard loads after login", async ({ page }) => {
    const { email, password } = e2eCredentials!;

    await signInViaLoginForm(page, email, password);
    await expect(page).toHaveURL((url) => new URL(url).pathname === "/");
    await expect(
      page.getByRole("heading", {
        name: "School partnership pipeline dashboard"
      })
    ).toBeVisible({ timeout: 20_000 });

    const loginErrors = await readVisibleLoginErrors(page);
    expect(loginErrors).toEqual([]);
  });
});
