import { describe, expect, it } from "vitest";

import {
  readFirefliesWebhookSecret,
  validateFirefliesWebhookSecret
} from "@/lib/meetingImports/webhookAuth";
import {
  isFirefliesImportReady,
  resolveMeetingImportConfig
} from "@/lib/meetingImports/config";

describe("fireflies webhook auth", () => {
  it("compares secrets in constant time", () => {
    expect(validateFirefliesWebhookSecret("secret", "secret")).toBe(true);
    expect(validateFirefliesWebhookSecret("secret", "Secret")).toBe(false);
    expect(validateFirefliesWebhookSecret(null, "secret")).toBe(false);
    expect(validateFirefliesWebhookSecret("secret", null)).toBe(false);
  });

  it("reads bearer and custom headers", () => {
    expect(
      readFirefliesWebhookSecret(
        new Request("https://example.test", {
          headers: { authorization: "Bearer abc123" }
        })
      )
    ).toBe("abc123");

    expect(
      readFirefliesWebhookSecret(
        new Request("https://example.test", {
          headers: { "x-fireflies-webhook-secret": "ff-secret" }
        })
      )
    ).toBe("ff-secret");
  });
});

describe("meeting import config", () => {
  it("requires enabled + webhook secret for readiness", () => {
    expect(
      isFirefliesImportReady(
        resolveMeetingImportConfig({
          MEETING_IMPORT_ENABLED: "true",
          FIREFLIES_WEBHOOK_SECRET: "s"
        })
      )
    ).toBe(true);

    expect(
      isFirefliesImportReady(
        resolveMeetingImportConfig({
          MEETING_IMPORT_ENABLED: "true"
        })
      )
    ).toBe(false);

    expect(
      isFirefliesImportReady(
        resolveMeetingImportConfig({
          MEETING_IMPORT_ENABLED: "false",
          FIREFLIES_WEBHOOK_SECRET: "s"
        })
      )
    ).toBe(false);
  });
});
