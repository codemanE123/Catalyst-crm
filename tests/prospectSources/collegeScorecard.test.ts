import { describe, expect, it, vi } from "vitest";

import {
  buildCollegeScorecardRequestUrl,
  fetchCollegeScorecardSchoolsPage,
  generateCollegeScorecardCandidates,
  mapCollegeScorecardRecordToCandidate,
  redactCollegeScorecardRequestUrl,
  resolveScorecardApiFilters,
  CollegeScorecardProviderError
} from "@/lib/prospectSources/collegeScorecard";
import { resolveCollegeScorecardConfig } from "@/lib/prospectSources/config";
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
  it("maps a public Scorecard record into a source candidate with citations", () => {
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
      source_name: "U.S. Department of Education College Scorecard",
      enrollment_size: 12000
    });
    expect(candidate?.source_urls).toContain(
      "https://collegescorecard.ed.gov/data/api/"
    );
    expect(candidate?.rationale).toContain("Public enrollment");
    expect(candidate?.rationale).toContain("No personal contact information");
    expect(candidate?.rationale).not.toMatch(/api_key=(?!REDACTED)/);
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

describe("resolveScorecardApiFilters", () => {
  it("maps single institution types to API filters", () => {
    expect(resolveScorecardApiFilters(["hbcu"])).toEqual({
      "school.minority_serving.historically_black": "1"
    });
    expect(resolveScorecardApiFilters(["hbcu", "cae"])).toEqual({});
  });
});

describe("buildCollegeScorecardRequestUrl", () => {
  it("supports state, pagination, name keywords, and type filters", () => {
    const url = buildCollegeScorecardRequestUrl({
      apiKey: "secret",
      stateCode: "MD",
      page: 1,
      perPage: 50,
      schoolNameKeyword: "morgan",
      apiFilters: { "school.ownership": "1" }
    });

    expect(url).toContain("school.state=MD");
    expect(url).toContain("page=1");
    expect(url).toContain("per_page=50");
    expect(url).toContain("school.name=morgan");
    expect(url).toContain("school.ownership=1");
    expect(url).toContain("api_key=secret");
  });
});

describe("fetchCollegeScorecardSchoolsPage", () => {
  it("parses mocked API responses and redacts keys", async () => {
    const fetchText = vi.fn(async () =>
      JSON.stringify({
        results: [sampleRecord],
        metadata: { total: 1, page: 0, per_page: 100 }
      })
    );

    const result = await fetchCollegeScorecardSchoolsPage({
      apiKey: "secret-key",
      stateCode: "DC",
      page: 0,
      perPage: 100,
      timeoutMs: 5000,
      maxRetries: 0,
      fetchText
    });

    expect(result.records).toHaveLength(1);
    expect(result.request_url).toContain("api_key=REDACTED");
    expect(result.request_url).not.toContain("secret-key");
    expect(fetchText).toHaveBeenCalledTimes(1);
  });

  it("retries rate-limited responses then succeeds", async () => {
    const fetchText = vi
      .fn()
      .mockRejectedValueOnce(new Error("Request failed with status 429."))
      .mockResolvedValueOnce(JSON.stringify({ results: [sampleRecord] }));

    const result = await fetchCollegeScorecardSchoolsPage({
      apiKey: "key",
      stateCode: "DC",
      page: 0,
      perPage: 100,
      timeoutMs: 5000,
      maxRetries: 2,
      fetchText
    });

    expect(result.records).toHaveLength(1);
    expect(fetchText).toHaveBeenCalledTimes(2);
  });

  it("surfaces rate_limited after retries are exhausted", async () => {
    const fetchText = vi
      .fn()
      .mockRejectedValue(new Error("Request failed with status 429."));

    await expect(
      fetchCollegeScorecardSchoolsPage({
        apiKey: "key",
        stateCode: "DC",
        page: 0,
        perPage: 100,
        timeoutMs: 1000,
        maxRetries: 1,
        fetchText
      })
    ).rejects.toMatchObject({
      code: "rate_limited"
    });
  });
});

describe("generateCollegeScorecardCandidates", () => {
  it("paginates mocked responses, respects max results, and records meta", async () => {
    const page0 = Array.from({ length: 100 }, (_, index) => ({
      ...sampleRecord,
      id: 1000 + index,
      "school.name": `Test University ${index}`,
      "school.state": "MD"
    }));

    const fetchText = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ results: page0 }))
      .mockResolvedValueOnce(JSON.stringify({ results: [] }));

    const { candidates, meta } = await generateCollegeScorecardCandidates(
      {
        geography: "Maryland",
        schoolTypes: ["hbcu"],
        keywords: "",
        maxResults: 5
      },
      "job-1",
      {
        apiKey: "key",
        fetchText,
        config: {
          ...resolveCollegeScorecardConfig({
            COLLEGE_SCORECARD_ENABLED: "true",
            COLLEGE_SCORECARD_API_KEY: "key"
          }),
          enabled: true,
          apiKey: "key",
          maxPages: 2,
          maxRetries: 0,
          minRequestIntervalMs: 0,
          timeoutMs: 5000,
          perPage: 100
        },
        sleepFn: async () => undefined
      }
    );

    expect(candidates.length).toBeLessThanOrEqual(5);
    expect(candidates[0]?.source_name).toContain("College Scorecard");
    expect(meta.request_count).toBeGreaterThanOrEqual(1);
    expect(meta.error_code).toBeNull();
  });

  it("throws not_configured when key missing", async () => {
    await expect(
      generateCollegeScorecardCandidates(
        {
          geography: "MD",
          schoolTypes: ["hbcu"],
          keywords: "",
          maxResults: 3
        },
        "job-2",
        {
          apiKey: undefined,
          config: {
            enabled: true,
            apiKey: null,
            timeoutMs: 1000,
            maxPages: 1,
            maxRetries: 0,
            minRequestIntervalMs: 0,
            perPage: 100
          }
        }
      )
    ).rejects.toBeInstanceOf(CollegeScorecardProviderError);
  });
});
