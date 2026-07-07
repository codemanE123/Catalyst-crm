import { describe, expect, it } from "vitest";

import {
  formatProspectSchoolTypes,
  parseProspectGenerationInput,
  parseProspectSchoolTypes,
  summarizeProspectJobInput
} from "@/lib/prospectGeneration";

function buildForm(values: Record<string, string | string[]>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        formData.append(key, item);
      }
      continue;
    }

    formData.set(key, value);
  }

  return formData;
}

describe("parseProspectSchoolTypes", () => {
  it("returns unique valid school types", () => {
    expect(
      parseProspectSchoolTypes(["hbcu", "cae", "invalid", "hbcu"])
    ).toEqual(["hbcu", "cae"]);
  });

  it("returns null when no valid school types are selected", () => {
    expect(parseProspectSchoolTypes(["invalid"])).toBeNull();
    expect(parseProspectSchoolTypes([])).toBeNull();
  });
});

describe("parseProspectGenerationInput", () => {
  it("parses a valid prospect generation form", () => {
    const result = parseProspectGenerationInput(
      buildForm({
        geography: "Southeast US",
        school_types: ["hbcu", "cae"],
        keywords: "cybersecurity",
        max_results: "25"
      })
    );

    expect(result).toEqual({
      ok: true,
      input: {
        geography: "Southeast US",
        schoolTypes: ["hbcu", "cae"],
        keywords: "cybersecurity",
        maxResults: 25
      }
    });
  });

  it("requires geography and at least one school type", () => {
    expect(
      parseProspectGenerationInput(
        buildForm({
          geography: "",
          school_types: ["hbcu"]
        })
      )
    ).toEqual({ ok: false, error: "Geography is required." });

    expect(
      parseProspectGenerationInput(
        buildForm({
          geography: "Texas",
          school_types: []
        })
      )
    ).toEqual({ ok: false, error: "Select at least one school type." });
  });

  it("validates maximum results bounds", () => {
    expect(
      parseProspectGenerationInput(
        buildForm({
          geography: "Texas",
          school_types: ["state_university"],
          max_results: "0"
        })
      )
    ).toEqual({
      ok: false,
      error: "Maximum results must be between 1 and 100."
    });

    expect(
      parseProspectGenerationInput(
        buildForm({
          geography: "Texas",
          school_types: ["state_university"],
          max_results: "150"
        })
      )
    ).toEqual({
      ok: false,
      error: "Maximum results must be between 1 and 100."
    });
  });
});

describe("prospect generation formatting helpers", () => {
  it("formats school types and summarizes job input", () => {
    const input = {
      geography: "Texas",
      schoolTypes: ["hbcu", "cae"] as const,
      keywords: "cybersecurity",
      maxResults: 25
    };

    expect(formatProspectSchoolTypes([...input.schoolTypes])).toBe(
      "HBCU, Cybersecurity CAE"
    );
    expect(summarizeProspectJobInput(input)).toBe(
      "Texas · HBCU, Cybersecurity CAE · cybersecurity · max 25"
    );
  });
});
