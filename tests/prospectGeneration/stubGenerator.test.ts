import { describe, expect, it } from "vitest";

import {
  CURATED_STUB_SCHOOL_SEEDS,
  generateMockProspectCandidates,
  matchesGeography,
  matchesKeywords,
  matchesSchoolTypes
} from "@/lib/prospectCandidateStub";

describe("prospect candidate stub generator", () => {
  it("filters by school type, geography, and keywords", () => {
    const howard = CURATED_STUB_SCHOOL_SEEDS[0];

    expect(matchesSchoolTypes(howard, ["hbcu"])).toBe(true);
    expect(matchesSchoolTypes(howard, ["community_college"])).toBe(false);
    expect(matchesGeography(howard, "Southeast US")).toBe(true);
    expect(matchesGeography(howard, "Texas")).toBe(false);
    expect(matchesKeywords(howard, "cybersecurity")).toBe(true);
    expect(matchesKeywords(howard, "aviation")).toBe(false);
  });

  it("generates deterministic mock candidates for a job", () => {
    const input = {
      geography: "Southeast US",
      schoolTypes: ["hbcu", "cae"] as const,
      keywords: "cybersecurity",
      maxResults: 3
    };

    const firstRun = generateMockProspectCandidates(input, "job-123");
    const secondRun = generateMockProspectCandidates(input, "job-123");

    expect(firstRun).toEqual(secondRun);
    expect(firstRun.length).toBeLessThanOrEqual(3);
    expect(firstRun.length).toBeGreaterThan(0);
    expect(firstRun[0]).toMatchObject({
      name: expect.any(String),
      website: expect.stringMatching(/^https:\/\//),
      district: expect.any(String),
      location: expect.any(String),
      rationale: expect.any(String),
      confidence_score: expect.any(Number)
    });
  });

  it("respects maxResults even when many schools match", () => {
    const input = {
      geography: "United States",
      schoolTypes: ["state_university", "community_college", "hbcu", "cae", "workforce_cyber"],
      keywords: "",
      maxResults: 5
    };

    const candidates = generateMockProspectCandidates(input, "job-456");

    expect(candidates).toHaveLength(5);
  });
});
