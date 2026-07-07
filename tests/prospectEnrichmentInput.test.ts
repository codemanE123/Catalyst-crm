import { describe, expect, it } from "vitest";

import { buildProspectEnrichmentInput } from "@/lib/prospectEnrichmentInput";

const candidate = {
  name: "Howard University",
  website: "https://www.howard.edu",
  district: "Washington, DC",
  location: "Washington, DC",
  rationale: "HBCU with cybersecurity programs.",
  source_name: "U.S. Department of Education College Scorecard",
  source_url: "https://collegescorecard.ed.gov/data/api/"
};

const jobInput = {
  geography: "Southeast US",
  schoolTypes: ["hbcu", "cae"] as const,
  keywords: "cybersecurity workforce",
  maxResults: 25
};

describe("buildProspectEnrichmentInput", () => {
  it("maps only public candidate and job fields into the LLM input schema", () => {
    const input = buildProspectEnrichmentInput({ candidate, jobInput });

    expect(input).toEqual({
      institution: {
        name: "Howard University",
        city: "Washington",
        state: "DC",
        website_domain: "howard.edu",
        categories: ["HBCU", "Cybersecurity CAE"],
        enrollment_band: null,
        program_highlights: [
          "HBCU with cybersecurity programs.",
          "cybersecurity workforce"
        ]
      },
      icp: {
        geography: "Southeast US",
        school_types: ["hbcu", "cae"],
        keywords: "cybersecurity workforce"
      },
      sources: [
        {
          name: "U.S. Department of Education College Scorecard",
          url: "https://collegescorecard.ed.gov/data/api/"
        }
      ]
    });
  });

  it("does not include private CRM fields in the payload", () => {
    const input = buildProspectEnrichmentInput({
      candidate: {
        ...candidate,
        notes: "private note",
        contacts: [{ email: "dean@school.edu" }]
      } as typeof candidate & {
        notes: string;
        contacts: Array<{ email: string }>;
      },
      jobInput
    });

    expect(input).not.toHaveProperty("notes");
    expect(input).not.toHaveProperty("contacts");
    expect(JSON.stringify(input)).not.toContain("private note");
    expect(JSON.stringify(input)).not.toContain("dean@school.edu");
  });
});
