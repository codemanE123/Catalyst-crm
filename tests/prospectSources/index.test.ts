import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateProspectCandidatesForJob } from "@/lib/prospectSources";

const jobInput = {
  geography: "DC",
  schoolTypes: ["hbcu"] as const,
  keywords: "",
  maxResults: 5
};

const samplePayload = {
  results: [
    {
      id: 131496,
      "school.name": "Howard University",
      "school.city": "Washington",
      "school.state": "DC",
      "school.school_url": "howard.edu",
      "school.ownership": 2,
      "school.degrees_awarded.predominant": 3,
      "school.minority_serving.historically_black": 1,
      "latest.student.size": 12000,
      "latest.programs.cip_4_digit": "11.0701",
      "latest.programs.title": "Computer Science"
    }
  ]
};

describe("generateProspectCandidatesForJob", () => {
  const envKeys = [
    "COLLEGE_SCORECARD_API_KEY",
    "DATA_GOV_API_KEY",
    "COLLEGE_SCORECARD_ENABLED",
    "COLLEGE_SCORECARD_ALLOW_STUB",
    "COLLEGE_SCORECARD_MIN_REQUEST_INTERVAL_MS",
    "COLLEGE_SCORECARD_MAX_RETRIES",
    "NODE_ENV",
    "VERCEL_ENV"
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env.NODE_ENV = "test";
    process.env.COLLEGE_SCORECARD_MIN_REQUEST_INTERVAL_MS = "0";
    process.env.COLLEGE_SCORECARD_MAX_RETRIES = "0";
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    vi.restoreAllMocks();
  });

  it("returns a safe configuration result when the API key is missing (no silent stub)", async () => {
    const result = await generateProspectCandidatesForJob(jobInput, "job-stub", {
      env: process.env
    });

    expect(result.summary.source).toBe("unconfigured");
    expect(result.summary.configuration_status).toBe("missing_api_key");
    expect(result.drafts).toHaveLength(0);
    expect(result.summary.fallback_reason).toMatch(/COLLEGE_SCORECARD_API_KEY/);
  });

  it("returns disabled configuration when COLLEGE_SCORECARD_ENABLED=false", async () => {
    process.env.COLLEGE_SCORECARD_ENABLED = "false";
    process.env.COLLEGE_SCORECARD_API_KEY = "test-key";

    const result = await generateProspectCandidatesForJob(jobInput, "job-disabled", {
      env: process.env
    });

    expect(result.summary.source).toBe("unconfigured");
    expect(result.summary.configuration_status).toBe("disabled");
    expect(result.drafts).toHaveLength(0);
  });

  it("allows development stub only when explicitly in development", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.COLLEGE_SCORECARD_API_KEY;

    const result = await generateProspectCandidatesForJob(jobInput, "job-dev", {
      env: process.env
    });

    expect(result.summary.source).toBe("stub_generator");
    expect(result.summary.configuration_status).toBe("stub_dev_only");
    expect(result.drafts.length).toBeGreaterThan(0);
  });

  it("never stubs on Vercel production even if ALLOW_STUB is set", async () => {
    process.env.NODE_ENV = "development";
    process.env.VERCEL_ENV = "production";
    process.env.COLLEGE_SCORECARD_ALLOW_STUB = "true";

    const result = await generateProspectCandidatesForJob(jobInput, "job-prod", {
      env: process.env
    });

    expect(result.summary.source).toBe("unconfigured");
    expect(result.drafts).toHaveLength(0);
  });

  it("uses College Scorecard when configured and maps mocked API records", async () => {
    process.env.COLLEGE_SCORECARD_API_KEY = "test-key";
    process.env.COLLEGE_SCORECARD_ENABLED = "true";

    const fetchText = vi.fn(async () => JSON.stringify(samplePayload));

    const result = await generateProspectCandidatesForJob(jobInput, "job-scorecard", {
      env: process.env,
      fetchText
    });

    expect(result.summary.source).toBe("college_scorecard");
    expect(result.summary.fallback_reason).toBeUndefined();
    expect(result.summary.provider_request_count).toBeGreaterThanOrEqual(1);
    expect(result.drafts[0]).toMatchObject({
      name: "Howard University",
      website: "https://howard.edu",
      district: "Washington, DC",
      source_name: "U.S. Department of Education College Scorecard",
      source_url: "https://collegescorecard.ed.gov/data/api/"
    });
    expect(result.drafts[0]?.rationale).toContain("Public enrollment");
    expect(result.drafts[0]?.rationale).not.toContain("test-key");
    expect(fetchText).toHaveBeenCalled();
  });

  it("returns no_matches without stubbing outside development", async () => {
    process.env.COLLEGE_SCORECARD_API_KEY = "test-key";
    process.env.COLLEGE_SCORECARD_ENABLED = "true";

    const fetchText = vi.fn(async () => JSON.stringify({ results: [] }));

    const result = await generateProspectCandidatesForJob(
      {
        geography: "DC",
        schoolTypes: ["community_college"],
        keywords: "zzzz-not-a-school",
        maxResults: 3
      },
      "job-empty",
      { env: process.env, fetchText }
    );

    expect(result.summary.source).toBe("unconfigured");
    expect(result.summary.configuration_status).toBe("no_matches");
    expect(result.drafts).toHaveLength(0);
  });
});
