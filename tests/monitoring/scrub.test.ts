import { describe, expect, it, vi } from "vitest";

import {
  getMonitoringEnvironment,
  isMonitoringEnabled,
  isSensitiveKey,
  scrubMonitoringEvent,
  scrubString
} from "@/lib/monitoring";

describe("monitoring scrubbing", () => {
  it("flags sensitive CRM and auth keys", () => {
    expect(isSensitiveKey("email")).toBe(true);
    expect(isSensitiveKey("raw_notes")).toBe(true);
    expect(isSensitiveKey("budget_owner")).toBe(true);
    expect(isSensitiveKey("authorization")).toBe(true);
    expect(isSensitiveKey("school_name")).toBe(false);
  });

  it("redacts emails and JWT-like tokens from strings", () => {
    const scrubbed = scrubString(
      "user pilot@university.edu token eyJhbGciOiJIUzI1NiJ9.payload.signature"
    );

    expect(scrubbed).not.toContain("pilot@university.edu");
    expect(scrubbed).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(scrubbed).toContain("[Redacted]");
  });

  it("scrubs request payloads and user email before send", () => {
    const event = scrubMonitoringEvent({
      request: {
        headers: {
          authorization: "Bearer secret-token",
          cookie: "sb-access-token=abc"
        },
        cookies: {
          "sb-access-token": "abc"
        },
        data: {
          email: "pilot@university.edu",
          raw_notes: "confidential notes",
          budget: "50000"
        }
      },
      user: {
        id: "user-123",
        email: "pilot@university.edu"
      },
      extra: {
        details: {
          password: "secret",
          objections: "pricing"
        }
      }
    });

    expect(event?.request?.headers?.authorization).toBe("[Redacted]");
    expect(event?.request?.cookies).toEqual({ "sb-access-token": "[Redacted]" });
    expect(event?.request?.data).toBeUndefined();
    expect(event?.user?.email).toBeUndefined();
    expect(event?.extra?.details).toEqual({
      password: "[Redacted]",
      objections: "[Redacted]"
    });
  });
});

describe("monitoring environment", () => {
  it("maps Vercel preview to staging", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("SENTRY_ENVIRONMENT", "");

    expect(getMonitoringEnvironment()).toBe("staging");

    vi.unstubAllEnvs();
  });

  it("is disabled without a DSN", () => {
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

    expect(isMonitoringEnabled()).toBe(false);

    vi.unstubAllEnvs();
  });
});
