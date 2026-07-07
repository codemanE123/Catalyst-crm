import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateProspectOutreachDraftWithLlm,
  getProspectOutreachDraftStatus,
  validateProspectOutreachDraftOutput
} from "@/lib/llm/outreachDraft";

const validInput = {
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
};

const validOutput = {
  draft_text: `Subject: Partnership opportunity for Howard University

Hi there,

I am reaching out regarding Howard University's cybersecurity and workforce development programs. Based on public program signals and your institutional focus, we would value a short discovery conversation.

Would you be open to a brief call next week?

Best,
Catalyst Partnerships Team`
};

describe("getProspectOutreachDraftStatus", () => {
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

    expect(getProspectOutreachDraftStatus()).toEqual({
      enabled: false,
      reason: "LLM enrichment is disabled. Set LLM_ENRICHMENT_ENABLED=true to enable."
    });
  });
});

describe("generateProspectOutreachDraftWithLlm", () => {
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

  it("returns a safe disabled result when LLM is off", async () => {
    process.env.LLM_ENRICHMENT_ENABLED = "false";

    const result = await generateProspectOutreachDraftWithLlm({
      input: validInput,
      context: {
        organization_id: "org-1",
        job_id: "job-1",
        candidate_id: "candidate-1"
      }
    });

    expect(result).toEqual({
      ok: false,
      status: "disabled",
      reason: "LLM enrichment is disabled. Set LLM_ENRICHMENT_ENABLED=true to enable."
    });
  });

  it("blocks forbidden private CRM fields", async () => {
    const fetchJson = vi.fn();

    const result = await generateProspectOutreachDraftWithLlm(
      {
        input: {
          ...validInput,
          notes: "private"
        } as typeof validInput & { notes: string },
        context: {
          organization_id: "org-1",
          job_id: "job-1",
          candidate_id: "candidate-1"
        }
      },
      { fetchJson }
    );

    expect(result).toEqual({
      ok: false,
      status: "blocked",
      reason: "Prospect outreach draft input contains forbidden private CRM fields.",
      block_reason: "forbidden_field"
    });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("validates provider output against the outreach draft schema", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ draft_text: "too short" }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    });

    const result = await generateProspectOutreachDraftWithLlm(
      {
        input: validInput,
        context: {
          organization_id: "org-1",
          job_id: "job-1",
          candidate_id: "candidate-1"
        }
      },
      { fetchJson }
    );

    expect(result).toEqual({
      ok: false,
      status: "validation_failed",
      reason: "Prospect outreach draft output did not match the schema."
    });
  });

  it("returns a draft when OpenAI returns valid JSON", async () => {
    const fetchJson = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validOutput) } }],
      usage: { prompt_tokens: 120, completion_tokens: 90 }
    });

    const result = await generateProspectOutreachDraftWithLlm(
      {
        input: validInput,
        context: {
          organization_id: "org-1",
          job_id: "job-1",
          candidate_id: "candidate-1"
        }
      },
      { fetchJson }
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data).toEqual(validOutput);
      expect(result.provider).toBe("openai");
    }
  });
});

describe("validateProspectOutreachDraftOutput", () => {
  it("accepts a valid outreach draft payload", () => {
    expect(validateProspectOutreachDraftOutput(validOutput)).toEqual({
      ok: true,
      data: validOutput
    });
  });
});
