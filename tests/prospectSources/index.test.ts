import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateProspectCandidatesForJob } from "@/lib/prospectSources";

const jobInput = {
  geography: "Southeast US",
  schoolTypes: ["hbcu", "cae"] as const,
  keywords: "cyber",
  maxResults: 5
};

describe("generateProspectCandidatesForJob", () => {
  const originalScorecardKey = process.env.COLLEGE_SCORECARD_API_KEY;
  const originalDataGovKey = process.env.DATA_GOV_API_KEY;

  beforeEach(() => {
    delete process.env.COLLEGE_SCORECARD_API_KEY;
    delete process.env.DATA_GOV_API_KEY;
  });

  afterEach(() => {
    if (originalScorecardKey === undefined) {
      delete process.env.COLLEGE_SCORECARD_API_KEY;
    } else {
      process.env.COLLEGE_SCORECARD_API_KEY = originalScorecardKey;
    }

    if (originalDataGovKey === undefined) {
      delete process.env.DATA_GOV_API_KEY;
    } else {
      process.env.DATA_GOV_API_KEY = originalDataGovKey;
    }

    vi.restoreAllMocks();
  });

  it("falls back to the stub generator when the API key is missing", async () => {
    const result = await generateProspectCandidatesForJob(jobInput, "job-stub");

    expect(result.summary.source).toBe("stub_generator");
    expect(result.summary.fallback_reason).toContain("COLLEGE_SCORECARD_API_KEY");
    expect(result.drafts.length).toBeGreaterThan(0);
  });

  it("uses College Scorecard when configured and records are returned", async () => {
    process.env.COLLEGE_SCORECARD_API_KEY = "test-key";

    const scorecardModule = await import("@/lib/prospectSources/collegeScorecard");
    vi.spyOn(scorecardModule, "generateCollegeScorecardCandidates").mockResolvedValue([
      {
        organization_name: "Morgan State University",
        website: "https://www.morgan.edu",
        city: "Baltimore",
        state: "MD",
        school_type: "HBCU; Public institution",
        rationale: "Source: U.S. Department of Education College Scorecard.",
        fit_score: 0.9,
        source_name: "U.S. Department of Education College Scorecard",
        source_urls: ["https://collegescorecard.ed.gov/data/api/"]
      }
    ]);

    const result = await generateProspectCandidatesForJob(jobInput, "job-scorecard");

    expect(result.summary.source).toBe("college_scorecard");
    expect(result.summary.fallback_reason).toBeUndefined();
    expect(result.drafts[0]).toMatchObject({
      name: "Morgan State University",
      website: "https://www.morgan.edu",
      district: "Baltimore, MD",
      confidence_score: 0.9
    });
  });
});
