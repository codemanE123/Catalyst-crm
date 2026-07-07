import { describe, expect, it } from "vitest";

import {
  mapCollegeScorecardRecordToCandidate,
  redactCollegeScorecardRequestUrl
} from "@/lib/prospectSources/collegeScorecard";
import { resolveStateCodesFromGeography } from "@/lib/prospectSources/geography";

const sampleRecord = {
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
  "latest.programs.title": "Computer and Information Systems Security"
};

describe("resolveStateCodesFromGeography", () => {
  it("resolves regions and direct state references", () => {
    expect(resolveStateCodesFromGeography("Texas")).toEqual(["TX"]);
    expect(resolveStateCodesFromGeography("Southeast US")).toEqual(
      expect.arrayContaining(["GA", "NC", "VA"])
    );
  });
});

describe("mapCollegeScorecardRecordToCandidate", () => {
  it("maps a public Scorecard record into a source candidate", () => {
    const requestUrl =
      "https://api.data.gov/ed/collegescorecard/v1/schools?api_key=REDACTED&school.state=DC";

    const candidate = mapCollegeScorecardRecordToCandidate(
      sampleRecord,
      {
        geography: "DC",
        schoolTypes: ["hbcu", "cae"],
        keywords: "security",
        maxResults: 10
      },
      requestUrl
    );

    expect(candidate).toMatchObject({
      organization_name: "Howard University",
      website: "https://howard.edu",
      city: "Washington",
      state: "DC",
      school_type: expect.stringContaining("HBCU"),
      fit_score: expect.any(Number),
      source_name: "U.S. Department of Education College Scorecard"
    });
    expect(candidate?.source_urls).toContain(
      "https://collegescorecard.ed.gov/data/api/"
    );
    expect(candidate?.rationale).toContain("College Scorecard");
  });

  it("returns null when school type filters do not match", () => {
    const candidate = mapCollegeScorecardRecordToCandidate(
      sampleRecord,
      {
        geography: "DC",
        schoolTypes: ["community_college"],
        keywords: "",
        maxResults: 10
      },
      "https://example.com"
    );

    expect(candidate).toBeNull();
  });
});

describe("redactCollegeScorecardRequestUrl", () => {
  it("redacts api keys from request URLs", () => {
    const redacted = redactCollegeScorecardRequestUrl(
      "https://api.data.gov/ed/collegescorecard/v1/schools?api_key=secret&school.state=MD"
    );

    expect(redacted).toContain("api_key=REDACTED");
    expect(redacted).not.toContain("secret");
  });
});
