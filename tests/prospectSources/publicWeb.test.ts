import { describe, expect, it } from "vitest";

import {
  hostnameMatchesAllowedSuffix,
  isBlockedSocialOrBrokerHost,
  validateOfficialInstitutionWebsite
} from "@/lib/prospectSources/domainAllowlist";
import { evaluateRobotsTxt } from "@/lib/prospectSources/robots";
import { buildPublicWebSearchQueries } from "@/lib/prospectSources/queryGeneration";
import {
  getPublicWebConfigurationStatus,
  resolvePublicWebDiscoveryConfig
} from "@/lib/prospectSources/publicWebConfig";
import { generatePublicWebCandidates } from "@/lib/prospectSources/publicWeb";
import { generateProspectCandidatesForJob } from "@/lib/prospectSources";

describe("domainAllowlist", () => {
  it("allows .edu and .gov suffixes", () => {
    expect(hostnameMatchesAllowedSuffix("www.mit.edu", [".edu", ".gov"])).toBe(
      true
    );
    expect(hostnameMatchesAllowedSuffix("nsa.gov", [".edu", ".gov"])).toBe(true);
  });

  it("blocks localhost, social, and commercial unrelated hosts", () => {
    expect(validateOfficialInstitutionWebsite("http://localhost/x", [".edu"]).ok).toBe(
      false
    );
    expect(
      validateOfficialInstitutionWebsite("https://127.0.0.1/", [".edu"]).ok
    ).toBe(false);
    expect(isBlockedSocialOrBrokerHost("www.linkedin.com")).toBe(true);
    expect(
      validateOfficialInstitutionWebsite("https://www.facebook.com/school", [
        ".edu"
      ]).ok
    ).toBe(false);
    expect(
      validateOfficialInstitutionWebsite("https://example.com", [".edu"]).ok
    ).toBe(false);
  });

  it("rejects login paths on otherwise allowed hosts", () => {
    expect(
      validateOfficialInstitutionWebsite("https://secure.university.edu/login", [
        ".edu"
      ]).ok
    ).toBe(false);
  });
});

describe("robots", () => {
  it("allows when no disallow matches", () => {
    const decision = evaluateRobotsTxt({
      robotsText: "User-agent: *\nDisallow: /admin\n",
      userAgent: "CatalystCRMProspectBot/1.0",
      path: "/academics"
    });
    expect(decision.allowed).toBe(true);
  });

  it("disallows blocked paths", () => {
    const decision = evaluateRobotsTxt({
      robotsText: "User-agent: *\nDisallow: /\n",
      userAgent: "CatalystCRMProspectBot/1.0",
      path: "/"
    });
    expect(decision.allowed).toBe(false);
  });
});

describe("queryGeneration", () => {
  it("builds at most two deterministic site:.edu queries", () => {
    const queries = buildPublicWebSearchQueries({
      geography: "Georgia",
      schoolTypes: ["hbcu"],
      keywords: "cybersecurity",
      maxResults: 10
    });
    expect(queries.length).toBeLessThanOrEqual(2);
    expect(queries[0]).toContain("site:.edu");
    expect(queries[0]?.toLowerCase()).toContain("georgia");
  });
});

describe("publicWebConfig", () => {
  it("defaults to disabled", () => {
    const config = resolvePublicWebDiscoveryConfig({});
    expect(config.enabled).toBe(false);
    expect(getPublicWebConfigurationStatus(config)).toBe("disabled");
  });

  it("reports missing keys when enabled", () => {
    const config = resolvePublicWebDiscoveryConfig({
      PUBLIC_WEB_DISCOVERY_ENABLED: "true"
    });
    expect(getPublicWebConfigurationStatus(config)).toBe("missing_api_key");
  });
});

describe("generatePublicWebCandidates", () => {
  it("returns empty when feature disabled", async () => {
    const { candidates, meta } = await generatePublicWebCandidates(
      {
        geography: "Texas",
        schoolTypes: ["state_university"],
        keywords: "",
        maxResults: 5
      },
      "job-1",
      {
        env: { PUBLIC_WEB_DISCOVERY_ENABLED: "false" }
      }
    );
    expect(candidates).toHaveLength(0);
    expect(meta.configuration_status).toBe("disabled");
  });

  it("discovers an allowed .edu from mocked search + homepage fetch", async () => {
    const fetchText = async (url: string) => {
      if (url.includes("googleapis.com/customsearch")) {
        return JSON.stringify({
          items: [
            {
              title: "Example State University",
              link: "https://www.examplestate.edu/programs",
              snippet: "Cybersecurity and workforce partnerships"
            }
          ]
        });
      }
      if (url.endsWith("/robots.txt")) {
        return "User-agent: *\nAllow: /\n";
      }
      return `<html><head><title>Example State University</title></head><body>cybersecurity workforce artificial intelligence</body></html>`;
    };

    const { candidates, meta } = await generatePublicWebCandidates(
      {
        geography: "Texas",
        schoolTypes: ["state_university"],
        keywords: "cybersecurity",
        maxResults: 5
      },
      "job-web",
      {
        env: {
          PUBLIC_WEB_DISCOVERY_ENABLED: "true",
          WEB_SEARCH_API_KEY: "test-key",
          WEB_SEARCH_ENGINE_ID: "test-cx",
          PUBLIC_WEB_REQUIRE_ROBOTS_ALLOWED: "true",
          PUBLIC_WEB_MAX_PAGES_PER_SCHOOL: "2",
          PUBLIC_WEB_FETCH_TIMEOUT_MS: "4000"
        },
        fetchText,
        sleepFn: async () => undefined
      }
    );

    expect(meta.error_code).toBeNull();
    expect(candidates.length).toBe(1);
    expect(candidates[0]?.website).toContain("examplestate.edu");
    expect(candidates[0]?.source_urls.length).toBeGreaterThan(0);
    expect(candidates[0]?.rationale).not.toMatch(/@/);
    expect(candidates[0]?.discovery_method).toBe("public_web");
  });

  it("skips social results and respects max schools", async () => {
    const fetchText = async (url: string) => {
      if (url.includes("googleapis.com/customsearch")) {
        return JSON.stringify({
          items: [
            {
              title: "Spam",
              link: "https://www.linkedin.com/school/x",
              snippet: "social"
            },
            {
              title: "Real U",
              link: "https://realu.edu/",
              snippet: "university"
            }
          ]
        });
      }
      if (url.endsWith("/robots.txt")) {
        return "User-agent: *\nDisallow:\n";
      }
      return "<html><title>Real U</title><body>programs</body></html>";
    };

    const { candidates } = await generatePublicWebCandidates(
      {
        geography: "Texas",
        schoolTypes: ["state_university"],
        keywords: "",
        maxResults: 5
      },
      "job-filter",
      {
        env: {
          PUBLIC_WEB_DISCOVERY_ENABLED: "true",
          WEB_SEARCH_API_KEY: "k",
          WEB_SEARCH_ENGINE_ID: "cx",
          PUBLIC_WEB_MAX_SCHOOLS_PER_JOB: "1"
        },
        fetchText,
        sleepFn: async () => undefined
      }
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.website).toContain("realu.edu");
  });
});

describe("generateProspectCandidatesForJob cascade", () => {
  it("uses public web when Scorecard returns no matches and web is configured", async () => {
    const fetchText = async (url: string) => {
      if (url.includes("api.data.gov")) {
        return JSON.stringify({ results: [] });
      }
      if (url.includes("googleapis.com/customsearch")) {
        return JSON.stringify({
          items: [
            {
              title: "Web Found College",
              link: "https://webfound.edu/",
              snippet: "AI programs"
            }
          ]
        });
      }
      if (url.endsWith("/robots.txt")) {
        return "User-agent: *\nAllow: /\n";
      }
      return "<html><title>Web Found College</title><body>artificial intelligence</body></html>";
    };

    const result = await generateProspectCandidatesForJob(
      {
        geography: "TX",
        schoolTypes: ["state_university"],
        keywords: "",
        maxResults: 5
      },
      "job-cascade",
      {
        env: {
          NODE_ENV: "test",
          COLLEGE_SCORECARD_ENABLED: "true",
          COLLEGE_SCORECARD_API_KEY: "score-key",
          COLLEGE_SCORECARD_MIN_REQUEST_INTERVAL_MS: "0",
          COLLEGE_SCORECARD_MAX_RETRIES: "0",
          PUBLIC_WEB_DISCOVERY_ENABLED: "true",
          WEB_SEARCH_API_KEY: "web-key",
          WEB_SEARCH_ENGINE_ID: "cx"
        },
        fetchText
      }
    );

    expect(result.summary.source).toBe("public_web");
    expect(result.drafts[0]?.name).toContain("Web Found");
    expect(result.drafts[0]?.discovery_method).toBe("public_web");
  });

  it("never stubs on Vercel preview when providers fail", async () => {
    const result = await generateProspectCandidatesForJob(
      {
        geography: "TX",
        schoolTypes: ["hbcu"],
        keywords: "",
        maxResults: 3
      },
      "job-preview",
      {
        env: {
          NODE_ENV: "development",
          VERCEL_ENV: "preview",
          COLLEGE_SCORECARD_ALLOW_STUB: "true",
          PUBLIC_WEB_DISCOVERY_ENABLED: "false"
        }
      }
    );

    expect(result.drafts).toHaveLength(0);
    expect(result.summary.source).not.toBe("stub_generator");
  });
});
