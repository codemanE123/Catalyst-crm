import { expect, type Page } from "@playwright/test";

export function isDashboardUrl(url: string): boolean {
  return new URL(url).pathname === "/";
}

export function getLoginErrorLocator(page: Page) {
  return page.locator("main p.text-red-800, main p.text-amber-900");
}

export async function readVisibleLoginErrors(page: Page): Promise<string[]> {
  const locator = getLoginErrorLocator(page);
  const count = await locator.count();
  const messages: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const text = (await locator.nth(index).textContent())?.trim();

    if (text) {
      messages.push(text);
    }
  }

  return messages;
}

export async function assertLoginFailureDiagnostics(
  page: Page,
  email: string
): Promise<never> {
  const url = page.url();
  const parsedUrl = new URL(url);
  const queryError = parsedUrl.searchParams.get("error");
  const visibleErrors = await readVisibleLoginErrors(page);

  const details = [
    `Login did not reach the dashboard.`,
    `Current URL: ${url}`,
    `E2E_BASE_URL: ${process.env.E2E_BASE_URL ?? "(unset)"}`,
    `E2E_USER_EMAIL: ${email}`,
    queryError
      ? `Login query error: ${decodeURIComponent(queryError)}`
      : null,
    visibleErrors.length > 0
      ? `Visible login messages: ${visibleErrors.join(" | ")}`
      : "No visible login error message. Check that credentials are valid and the sign-in button is enabled."
  ]
    .filter(Boolean)
    .join("\n");

  throw new Error(details);
}

export async function signInViaLoginForm(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  const signInButton = page.getByRole("button", { name: "Sign in" });
  await expect(signInButton).toBeEnabled({ timeout: 10_000 });

  const emailField = page.getByLabel("Email");
  const passwordField = page.getByLabel("Password");

  await emailField.fill(email);
  await passwordField.fill(password);

  try {
    await Promise.all([
      page.waitForURL((url) => isDashboardUrl(url.toString()), {
        timeout: 30_000,
        waitUntil: "load"
      }),
      signInButton.click()
    ]);
  } catch {
    if (!isDashboardUrl(page.url())) {
      await assertLoginFailureDiagnostics(page, email);
    }

    throw new Error(`Login navigation failed for ${email} at ${page.url()}`);
  }

  const postLoginErrors = await readVisibleLoginErrors(page);

  expect(
    postLoginErrors,
    `Unexpected login error after navigation: ${postLoginErrors.join(" | ")}`
  ).toEqual([]);
}
