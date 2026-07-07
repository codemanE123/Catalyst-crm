import { describe, expect, it } from "vitest";

import { buildProspectOutreachDraftInput } from "@/lib/prospectOutreachDraftInput";

const candidate = {
  name: "Howard University",
  website: "https://www.howard.edu",
  district: "Washington, DC",
  location: "Washington, DC",
  confidence_score: 0.91,
  source_name: "U.S. Department of Education College Scorecard",
  source_url: "https://collegescorecard.ed.gov/data/api/",
  enrichment_summary: "Public HBCU with cybersecurity program signals.",
  outreach_angle: "Lead with workforce development alignment.",
  recommended_next_step: "Initial outreach - cyber workforce program"
};

const jobInput = {
  geography: "Southeast US",
  schoolTypes: ["hbcu", "cae"] as const,
  keywords: "cybersecurity workforce",
  maxResults: 25
};

describe("buildProspectOutreachDraftInput", () => {
  it("maps only allowlisted public and enrichment fields", () => {
    expect(buildProspectOutreachDraftInput({ candidate, jobInput })).toEqual({
      organization_name: "Howard University",
      website: "https://www.howard.edu",
      city: "Washington",
      state: "DC",
      school_types: ["HBCU", "Cybersecurity CAE"],
      fit_score: 0.91,
      confidence_score: 0.91,
      source_name: "U.S. Department of Education College Scorecard",
      source_url: "https://collegescorecard.ed.gov/data/api/",
      enrichment_summary: "Public HBCU with cybersecurity program signals.",
      outreach_angle: "Lead with workforce development alignment.",
      recommended_next_step: "Initial outreach - cyber workforce program"
    });
  });

  it("does not include private CRM fields in the payload", () => {
    const input = buildProspectOutreachDraftInput({
      candidate: {
        ...candidate,
        notes: "private note",
        rationale: "internal rationale",
        objections: "budget concern"
      } as typeof candidate & {
        notes: string;
        rationale: string;
        objections: string;
      },
      jobInput
    });

    expect(input).not.toHaveProperty("notes");
    expect(input).not.toHaveProperty("rationale");
    expect(input).not.toHaveProperty("objections");
    expect(JSON.stringify(input)).not.toContain("private note");
    expect(JSON.stringify(input)).not.toContain("budget concern");
  });
});
