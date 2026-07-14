import { describe, expect, it } from "vitest";

import {
  mayUseCollegeScorecardStubFallback,
  resolveCollegeScorecardConfig
} from "@/lib/prospectSources/config";

describe("college scorecard config", () => {
  it("resolves defaults and env overrides", () => {
    const config = resolveCollegeScorecardConfig({
      COLLEGE_SCORECARD_ENABLED: "true",
      COLLEGE_SCORECARD_API_KEY: "abc",
      COLLEGE_SCORECARD_MAX_PAGES: "3",
      COLLEGE_SCORECARD_TIMEOUT_MS: "8000"
    });

    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe("abc");
    expect(config.maxPages).toBe(3);
    expect(config.timeoutMs).toBe(8000);
  });

  it("allows stub only in local development", () => {
    expect(
      mayUseCollegeScorecardStubFallback({
        NODE_ENV: "development"
      })
    ).toBe(true);

    expect(
      mayUseCollegeScorecardStubFallback({
        NODE_ENV: "test"
      })
    ).toBe(false);

    expect(
      mayUseCollegeScorecardStubFallback({
        NODE_ENV: "production"
      })
    ).toBe(false);

    expect(
      mayUseCollegeScorecardStubFallback({
        NODE_ENV: "development",
        VERCEL_ENV: "preview",
        COLLEGE_SCORECARD_ALLOW_STUB: "true"
      })
    ).toBe(false);
  });
});
