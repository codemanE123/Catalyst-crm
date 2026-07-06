import { expect, test } from "@playwright/test";

const E2E_SKIP_MESSAGE =
  "E2E smoke skipped: set E2E_BASE_URL, E2E_USER_EMAIL, and E2E_USER_PASSWORD.";

type E2eCredentials = {
  email: string;
  password: string;
};

function getE2eCredentials(): E2eCredentials | null {
  const baseURL = process.env.E2E_BASE_URL?.trim();
  const email = process.env.E2E_USER_EMAIL?.trim();
  const password = process.env.E2E_USER_PASSWORD;

  if (!baseURL || !email || password === undefined || password === "") {
    return null;
  }

  return { email, password };
}

const e2eCredentials = getE2eCredentials();

test.describe("Pilot Launch auth smoke", () => {
  test.beforeEach(() => {
    test.skip(!e2eCredentials, E2E_SKIP_MESSAGE);
  });

  test("/login loads", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("authenticated user can sign in", async ({ page }) => {
    const { email, password } = e2eCredentials!;

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/(\?.*)?$/, { timeout: 20_000 });
  });

  test("dashboard loads after login", async ({ page }) => {
    const { email, password } = e2eCredentials!;

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/(\?.*)?$/, { timeout: 20_000 });
    await expect(
      page.getByRole("heading", {
        name: "School partnership pipeline dashboard"
      })
    ).toBeVisible({ timeout: 20_000 });
  });
});
