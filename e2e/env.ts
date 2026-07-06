import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

const E2E_ENV_FILES = [".env.e2e.local", ".env.local"] as const;

export function loadE2eEnvFiles(): void {
  for (const file of E2E_ENV_FILES) {
    loadE2eEnvFile(path.join(projectRoot, file));
  }
}

function loadE2eEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();

    if (!key.startsWith("E2E_")) {
      continue;
    }

    if (process.env[key] !== undefined) {
      continue;
    }

    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLACEHOLDER_EMAILS = new Set([
  "your-test-user-email",
  "your-staging-user@example.com",
  "sales-smoke@example.com"
]);

export type E2eCredentials = {
  baseURL: string;
  email: string;
  password: string;
};

export function getE2eCredentials(): E2eCredentials | null {
  const baseURL = process.env.E2E_BASE_URL?.trim();
  const email = process.env.E2E_USER_EMAIL?.trim();
  const password = process.env.E2E_USER_PASSWORD;

  if (!baseURL || !email || password === undefined || password === "") {
    return null;
  }

  return { baseURL, email, password };
}

export function validateE2eCredentials(
  credentials: E2eCredentials
): string | null {
  if (PLACEHOLDER_EMAILS.has(credentials.email)) {
    return `E2E_USER_EMAIL is a documentation placeholder ("${credentials.email}"). Set a real Supabase Auth user email.`;
  }

  if (!EMAIL_PATTERN.test(credentials.email)) {
    return `E2E_USER_EMAIL must be a valid email address for the login form (got "${credentials.email}").`;
  }

  if (
    credentials.password === "your-password" ||
    credentials.password === "your-test-user-password"
  ) {
    return "E2E_USER_PASSWORD is a documentation placeholder. Set the real Supabase Auth password.";
  }

  try {
    new URL(credentials.baseURL);
  } catch {
    return `E2E_BASE_URL must be a valid URL (got "${credentials.baseURL}").`;
  }

  return null;
}

export const E2E_SKIP_MESSAGE =
  "E2E smoke skipped: set E2E_BASE_URL, E2E_USER_EMAIL, and E2E_USER_PASSWORD.";
