import { describe, expect, it } from "vitest";

import {
  STUB_GENERATOR_SOURCE_NAME,
  STUB_GENERATOR_SOURCE_URL,
  generateMockProspectCandidates
} from "@/lib/prospectCandidateStub";
import { toProspectCandidateDraft } from "@/lib/prospectSources/types";

describe("toProspectCandidateDraft", () => {
  it("maps source citation fields from a Scorecard candidate", () => {
    const draft = toProspectCandidateDraft({
      organization_name: "Howard University",
      website: "https://www.howard.edu",
      city: "Washington",
      state: "DC",
      school_type: "HBCU",
      rationale: "Category: HBCU. Source: U.S. Department of Education College Scorecard.",
      fit_score: 0.91,
      source_name: "U.S. Department of Education College Scorecard",
      source_urls: [
        "https://collegescorecard.ed.gov/data/api/",
        "https://api.data.gov/ed/collegescorecard/v1/schools?api_key=REDACTED"
      ]
    });

    expect(draft).toMatchObject({
      name: "Howard University",
      confidence_score: 0.91,
      source_name: "U.S. Department of Education College Scorecard",
      source_url: "https://collegescorecard.ed.gov/data/api/"
    });
  });
});

describe("stub generator source citations", () => {
  it("populates source fields and rationale for stub candidates", () => {
    const drafts = generateMockProspectCandidates(
      {
        geography: "Southeast US",
        schoolTypes: ["hbcu"],
        keywords: "",
        maxResults: 1
      },
      "job-1"
    );

    expect(drafts[0]).toMatchObject({
      source_name: STUB_GENERATOR_SOURCE_NAME,
      source_url: STUB_GENERATOR_SOURCE_URL,
      confidence_score: expect.any(Number)
    });
    expect(drafts[0]?.rationale).toContain("stub generator");
  });
});
