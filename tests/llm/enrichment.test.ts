import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enrichProspectCandidate,
  getLlmEnrichmentStatus,
  sanitizeProspectEnrichmentInput,
  scrubPiiFromString,
  validateProspectEnrichmentOutput
} from "@/lib/llm";

const validInput = {
  institution: {
    name: "Howard University",
    city: "Washington",
    state: "DC",
    website_domain: "howard.edu",
    categories: ["HBCU", "Cybersecurity-related programs"],
    enrollment_band: "10,000+",
    program_highlights: ["Computer and Information Systems Security"]
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
};

const validOutput = {
  public_summary:
    "Howard University is a historically Black university in Washington, DC with public cybersecurity-related program signals.",
  fit_rationale:
    "The institution aligns with the HBCU and cybersecurity-focused ICP for the Southeast geography and workforce partnership goals.",
  outreach_angle:
    "Lead with workforce development and cybersecurity program alignment for public institutional partnerships.",
  suggested_next_step: "Initial outreach - cyber workforce program",
  enrichment_confidence: 0.84,
  evidence_used: ["categories", "program_highlights", "geography"]
};

const validContext = {
  organization_id: "org-1",
  job_id: "job-1",
  candidate_id: "candidate-1"
};

describe("getLlmEnrichmentStatus", () => {
  const originalEnabled = process.env.LLM_ENRICHMENT_ENABLED;
  const originalApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env.LLM_ENRICHMENT_ENABLED;
    } else {
      process.env.LLM_ENRICHMENT_ENABLED = originalEnabled;
    }

    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("reports disabled when the feature flag is off", () => {
    delete process.env.LLM_ENRICHMENT_ENABLED;
    process.env.OPENAI_API_KEY = "test-key";

    expect(getLlmEnrichmentStatus()).toEqual({
      enabled: false,
      reason: "LLM enrichment is disabled. Set LLM_ENRICHMENT_ENABLED=true to enable."
    });
  });

  it("reports disabled when the API key is missing", () => {
    process.env.LLM_ENRICHMENT_ENABLED = "true";
    delete process.env.OPENAI_API_KEY;

    expect(getLlmEnrichmentStatus()).toEqual({
      enabled: false,
      reason: "LLM enrichment is disabled. OPENAI_API_KEY is not configured."
    });
  });
});

describe("enrichProspectCandidate", () => {
  const originalEnabled = process.env.LLM_ENRICHMENT_ENABLED;
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.LLM_ENRICHMENT_ENABLED = "true";
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (originalEnabled === undefined) {
      delete process.env.LLM_ENRICHMENT_ENABLED;
    } else {
      process.env.LLM_ENRICHMENT_ENABLED = originalEnabled;
    }

    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("returns a safe disabled result when enrichment is turned off", async () => {
    process.env.LLM_ENRICHMENT_ENABLED = "false";

    const result = await enrichProspectCandidate({
      input: validInput,
      context: validContext
    });

    expect(result).toEqual({
      ok: false,
      status: "disabled",
      reason: "LLM enrichment is disabled. Set LLM_ENRICHMENT_ENABLED=true to enable."
    });
  });

  it("returns a safe disabled result when the API key is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    const result = await enrichProspectCandidate({
      input: validInput,
      context: validContext
    });

    expect(result).toEqual({
      ok: false,
      status: "disabled",
      reason: "LLM enrichment is disabled. OPENAI_API_KEY is not configured."
    });
  });

  it("blocks requests that include forbidden private CRM fields", async () => {
    const fetchJson = vi.fn();

    const result = await enrichProspectCandidate(
      {
        input: {
          ...validInput,
          notes: "private pipeline note"
        } as typeof validInput & { notes: string },
        context: validContext
      },
      { fetchJson }
    );

    expect(result).toEqual({
      ok: false,
      status: "blocked",
      reason: "Prospect enrichment input contains forbidden private CRM fields.",
      block_reason: "forbidden_field"
    });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("validates provider output against the enrichment schema", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ invalid: true }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    });

    const result = await enrichProspectCandidate(
      {
        input: validInput,
        context: validContext
      },
      { fetchJson }
    );

    expect(result).toEqual({
      ok: false,
      status: "validation_failed",
      reason: "Prospect enrichment output did not match the schema."
    });
  });

  it("returns enriched output when OpenAI returns valid JSON", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validOutput) } }],
      usage: { prompt_tokens: 120, completion_tokens: 80 }
    });

    const result = await enrichProspectCandidate(
      {
        input: validInput,
        context: validContext
      },
      { fetchJson }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data).toEqual(validOutput);
      expect(result.provider).toBe("openai");
      expect(result.usage).toEqual({
        input_tokens: 120,
        output_tokens: 80
      });
      expect(result.estimated_cost_usd).toEqual(expect.any(Number));
    }
  });

  it("uses the approved model from production context", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validOutput) } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 }
    });

    const result = await enrichProspectCandidate(
      {
        input: validInput,
        context: validContext
      },
      {
        fetchJson,
        productionContext: {
          agentName: "ProspectEnrichmentAgent",
          model: "gpt-4o",
          limits: {
            maxExecutionsPerHour: 60,
            maxLlmCallsPerDay: 200,
            dailyBudgetUsd: 25,
            monthlyBudgetUsd: 250,
            maxConcurrentExecutions: 5,
            maxCandidateBatchSize: 50,
            maxChainDepth: 5,
            maxPromptChars: 24000,
            maxOutputChars: 8000,
            maxAutomaticRetries: 3,
            featureEnabled: true
          },
          policy: null,
          policyStamp: {
            policy_set_id: "ps-1",
            policy_version: "v1",
            policy_scope: "organization",
            resolved_policy_hash: "hash",
            policy_feature_enabled: true,
            policy_max_executions_per_hour: 60,
            policy_daily_budget_usd: 25,
            policy_require_approvals: true,
            policy_require_citations: true
          },
          promptStamp: {
            prompt_key: "prospect.enrich",
            prompt_version: "1.0.0",
            prompt_version_id: "pv-1",
            output_schema_version: "prospect.enrich.output.v1",
            provider: "openai",
            model: "gpt-4o",
            rollout_id: "roll-1",
            experiment_variant: "treatment"
          },
          certification: null,
          chainDepth: 0
        }
      }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model).toBe("gpt-4o");
      expect(result.prompt_version_id).toBe("pv-1");
      expect(result.policy_set_id).toBe("ps-1");
      expect(result.rollout_id).toBe("roll-1");
      expect(result.experiment_variant).toBe("treatment");
    }

    const body = JSON.parse(String(fetchJson.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.model).toBe("gpt-4o");
    expect(JSON.stringify(body)).not.toMatch(/private_notes|api_key|cookie/i);
  });
});

describe("PII scrubbing guard", () => {
  it("scrubs email, phone, and SSN patterns from strings", () => {
    const scrubbed = scrubPiiFromString(
      "Contact dean@school.edu or 202-555-0101. SSN 123-45-6789."
    );

    expect(scrubbed).not.toContain("dean@school.edu");
    expect(scrubbed).not.toContain("202-555-0101");
    expect(scrubbed).not.toContain("123-45-6789");
    expect(scrubbed).toContain("[REDACTED_EMAIL]");
  });

  it("sanitizes PII from allowed enrichment input fields", () => {
    const sanitized = sanitizeProspectEnrichmentInput({
      ...validInput,
      institution: {
        ...validInput.institution,
        name: "Reach us at partner@example.edu"
      }
    });

    expect(sanitized.institution.name).toContain("[REDACTED_EMAIL]");
    expect(sanitized.institution.name).not.toContain("partner@example.edu");
  });
});

describe("validateProspectEnrichmentOutput", () => {
  it("accepts a valid enrichment payload", () => {
    expect(validateProspectEnrichmentOutput(validOutput)).toEqual({
      ok: true,
      data: validOutput
    });
  });

  it("rejects incomplete enrichment payloads", () => {
    expect(validateProspectEnrichmentOutput({ public_summary: "too short" })).toEqual({
      ok: false,
      error: "Prospect enrichment output did not match the schema."
    });
  });
});
