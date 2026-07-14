import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetLlmEnrichmentStatus = vi.fn();
const mockInvokeLlmEnrichment = vi.fn();
const mockResolveLlmProductionContext = vi.fn();
const mockRecordAuditEvent = vi.fn();

vi.mock("@/lib/auditLog", () => ({
  AUDIT_ACTIONS: {
    prospectCandidateEnrich: "prospect_candidate.enrich"
  },
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args)
}));

vi.mock("@/lib/agents/usageStore", () => ({
  SupabaseAgentUsageStore: class {
    insert = vi.fn();
    countLlmCallsSince = vi.fn(async () => 0);
    sumEstimatedCostSince = vi.fn(async () => 0);
  }
}));

vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...actual,
    getLlmEnrichmentStatus: (...args: unknown[]) => mockGetLlmEnrichmentStatus(...args),
    enrichProspectCandidate: (...args: unknown[]) => mockInvokeLlmEnrichment(...args),
    resolveLlmProductionContextFromSupabase: (...args: unknown[]) =>
      mockResolveLlmProductionContext(...args)
  };
});

const pendingCandidate = {
  id: "candidate-1",
  organization_id: "org-1",
  job_id: "job-1",
  status: "pending_review",
  name: "Howard University",
  website: "https://www.howard.edu",
  district: "Washington, DC",
  location: "Washington, DC",
  rationale: "HBCU with cybersecurity programs.",
  confidence_score: 0.91,
  source_name: "College Scorecard",
  source_url: "https://collegescorecard.ed.gov/",
  enrichment_status: "queued"
};

const jobInput = {
  geography: "Southeast US",
  schoolTypes: ["hbcu"],
  keywords: "cybersecurity",
  maxResults: 10
};

function buildSupabaseMock() {
  const updates: Array<Record<string, unknown>> = [];

  return {
    from: vi.fn((table: string) => {
      if (table === "prospect_candidates") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: pendingCandidate,
                  error: null
                }))
              }))
            }))
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => {
                  updates.push(payload);
                  return { error: null };
                })
              }))
            }))
          }))
        };
      }

      if (table === "prospect_generation_jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: "job-1", input: jobInput, status: "completed" },
                  error: null
                }))
              }))
            }))
          }))
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    updates
  };
}

describe("executeProspectCandidateEnrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLlmEnrichmentStatus.mockReturnValue({
      enabled: true,
      reason: "enabled"
    });
    mockResolveLlmProductionContext.mockResolvedValue({
      ok: true,
      context: {
        agentName: "ProspectEnrichmentAgent",
        model: "gpt-4o-mini",
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
        policyStamp: null,
        promptStamp: null,
        certification: null,
        chainDepth: 0
      }
    });
  });

  it("marks running then enriched and returns success metadata", async () => {
    const supabase = buildSupabaseMock();
    mockInvokeLlmEnrichment.mockResolvedValue({
      ok: true,
      status: "enriched",
      provider: "openai",
      model: "gpt-4o-mini",
      prompt_version: "prospect.enrich.v1",
      data: {
        public_summary: "Howard University is a public HBCU with cybersecurity signals.",
        fit_rationale: "Aligns with HBCU cybersecurity ICP.",
        outreach_angle: "Lead with workforce development.",
        suggested_next_step: "Initial outreach",
        enrichment_confidence: 0.84,
        evidence_used: ["categories"]
      },
      usage: { input_tokens: 10, output_tokens: 20 }
    });

    const { executeProspectCandidateEnrichment } = await import(
      "@/lib/prospectEnrichment/execute"
    );
    const result = await executeProspectCandidateEnrichment({
      supabase: supabase as never,
      candidateId: "candidate-1",
      organizationId: "org-1",
      actorUserId: "user-1",
      agentExecutionId: "exec-1"
    });

    expect(result.ok).toBe(true);
    expect(supabase.updates[0]).toEqual({ enrichment_status: "running" });
    expect(supabase.updates[1]).toMatchObject({
      enrichment_status: "enriched",
      outreach_angle: "Lead with workforce development."
    });
    expect(mockInvokeLlmEnrichment).toHaveBeenCalledOnce();
  });

  it("sets budget_denied and returns permanent budget code without calling LLM", async () => {
    const supabase = buildSupabaseMock();
    mockResolveLlmProductionContext.mockResolvedValue({
      ok: false,
      reason_code: "daily_budget_limit",
      user_safe_message: "Daily AI budget limit reached."
    });

    const { executeProspectCandidateEnrichment } = await import(
      "@/lib/prospectEnrichment/execute"
    );
    const result = await executeProspectCandidateEnrichment({
      supabase: supabase as never,
      candidateId: "candidate-1",
      organizationId: "org-1",
      actorUserId: "user-1"
    });

    expect(result).toMatchObject({
      ok: false,
      error_code: "daily_budget_limit"
    });
    expect(supabase.updates.some((u) => u.enrichment_status === "budget_denied")).toBe(
      true
    );
    expect(mockInvokeLlmEnrichment).not.toHaveBeenCalled();
  });

  it("sets policy_denied for model_not_approved without retryable code", async () => {
    const supabase = buildSupabaseMock();
    mockResolveLlmProductionContext.mockResolvedValue({
      ok: false,
      reason_code: "model_not_approved",
      user_safe_message: "Model is not approved by policy."
    });

    const { executeProspectCandidateEnrichment } = await import(
      "@/lib/prospectEnrichment/execute"
    );
    const result = await executeProspectCandidateEnrichment({
      supabase: supabase as never,
      candidateId: "candidate-1",
      organizationId: "org-1",
      actorUserId: "user-1"
    });

    expect(result).toMatchObject({
      ok: false,
      error_code: "model_not_approved"
    });
    expect(supabase.updates.some((u) => u.enrichment_status === "policy_denied")).toBe(
      true
    );
  });

  it("returns validation as permanent and marks failed", async () => {
    const supabase = buildSupabaseMock();
    mockInvokeLlmEnrichment.mockResolvedValue({
      ok: false,
      status: "validation_failed",
      reason: "Prospect enrichment output did not match the schema."
    });

    const { executeProspectCandidateEnrichment } = await import(
      "@/lib/prospectEnrichment/execute"
    );
    const result = await executeProspectCandidateEnrichment({
      supabase: supabase as never,
      candidateId: "candidate-1",
      organizationId: "org-1",
      actorUserId: "user-1"
    });

    expect(result).toMatchObject({
      ok: false,
      error_code: "validation"
    });
    expect(supabase.updates.some((u) => u.enrichment_status === "failed")).toBe(true);
  });

  it("returns transient for provider errors so the worker can retry", async () => {
    const supabase = buildSupabaseMock();
    mockInvokeLlmEnrichment.mockResolvedValue({
      ok: false,
      status: "provider_error",
      reason: "OpenAI timed out."
    });

    const { executeProspectCandidateEnrichment } = await import(
      "@/lib/prospectEnrichment/execute"
    );
    const result = await executeProspectCandidateEnrichment({
      supabase: supabase as never,
      candidateId: "candidate-1",
      organizationId: "org-1",
      actorUserId: "user-1"
    });

    expect(result).toMatchObject({
      ok: false,
      error_code: "transient",
      error_message: "OpenAI timed out."
    });
  });
});

describe("ProspectEnrichmentAgent handler fail-closed", () => {
  it("does not stub enrichment as success when the dependency is missing", async () => {
    const { createAgentHandlerRegistry } = await import("@/lib/agents/handlers");
    const registry = createAgentHandlerRegistry({});
    const executor = registry.get("ProspectEnrichmentAgent");
    expect(executor).toBeDefined();

    const result = await executor!(
      {
        id: "exec-1",
        organization_id: "org-1",
        agent_name: "ProspectEnrichmentAgent",
        target_type: "prospect_candidate",
        target_id: "candidate-1",
        status: "running",
        attempt_count: 1,
        max_attempts: 3,
        chain_depth: 1,
        depends_on_execution_id: null,
        next_retry_at: null,
        started_at: null,
        completed_at: null,
        duration_ms: null,
        error_message: null,
        last_error_code: null,
        metadata: {},
        created_at: "2026-07-14T12:00:00.000Z",
        updated_at: "2026-07-14T12:00:00.000Z"
      },
      { actorUserId: "user-1" }
    );

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("configuration");
  });
});
