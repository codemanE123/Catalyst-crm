import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockRequireRole = vi.fn();
const mockGetRecordOwnershipFields = vi.fn();
const mockGetServerSupabaseClient = vi.fn();
const mockRecordAuditEvent = vi.fn();
const mockRevalidatePath = vi.fn();
const mockRevalidateSchoolViews = vi.fn();
const mockGetLlmEnrichmentStatus = vi.fn();
const mockQueueAgent = vi.fn();
const mockCreateAgentHandlerDependencies = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args)
}));

vi.mock("@/lib/revalidateSchoolViews", () => ({
  revalidateSchoolViews: (...args: unknown[]) => mockRevalidateSchoolViews(...args)
}));

vi.mock("@/lib/supabaseServer", () => ({
  requireUser: () => mockRequireUser(),
  getServerSupabaseClient: () => mockGetServerSupabaseClient(),
  isDevelopmentEnvironment: () => true,
  SUPABASE_CONFIGURATION_ERROR: "Supabase is not configured on this deployment."
}));

vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return {
    ...actual,
    requireRole: (...args: unknown[]) => mockRequireRole(...args)
  };
});

vi.mock("@/lib/supabase", () => ({
  getRecordOwnershipFields: () => mockGetRecordOwnershipFields()
}));

vi.mock("@/lib/auditLog", () => ({
  AUDIT_ACTIONS: {
    prospectCandidateEnrich: "prospect_candidate.enrich"
  },
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args)
}));

vi.mock("@/lib/actions/agentHandlerDependencies", () => ({
  createAgentHandlerDependencies: (...args: unknown[]) =>
    mockCreateAgentHandlerDependencies(...args)
}));

vi.mock("@/lib/agents/worker", () => ({
  createGatedAgentOrchestratorFromSupabase: () => ({
    queueAgent: (...args: unknown[]) => mockQueueAgent(...args)
  })
}));

vi.mock("@/lib/agents/usageStore", () => ({
  SupabaseAgentUsageStore: class {}
}));

vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...actual,
    getLlmEnrichmentStatus: () => mockGetLlmEnrichmentStatus()
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
  source_name: "U.S. Department of Education College Scorecard",
  source_url: "https://collegescorecard.ed.gov/data/api/",
  promoted_school_id: null,
  enrichment_summary: null,
  outreach_angle: null,
  recommended_next_step: null,
  enrichment_status: "not_enriched",
  enriched_at: null,
  created_at: "2026-07-07T12:00:00.000Z",
  updated_at: "2026-07-07T12:00:00.000Z"
};

const jobInput = {
  geography: "Southeast US",
  schoolTypes: ["hbcu", "cae"],
  keywords: "cybersecurity workforce",
  maxResults: 25
};

function buildSupabaseMock(options?: {
  candidate?: typeof pendingCandidate;
}) {
  const candidate = options?.candidate ?? pendingCandidate;
  const updatedCandidates: Array<Record<string, unknown>> = [];

  return {
    from: vi.fn((table: string) => {
      if (table === "prospect_candidates") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: candidate,
                  error: null
                }))
              }))
            }))
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => {
                  updatedCandidates.push(payload);
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
                  data: { input: jobInput, status: "completed" },
                  error: null
                }))
              }))
            }))
          }))
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    updatedCandidates
  };
}

describe("enrichProspectCandidate action (async queue)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      id: "user-1",
      email: "sales@example.com"
    });
    mockRequireRole.mockResolvedValue({ role: "sales" });
    mockGetRecordOwnershipFields.mockResolvedValue({
      organization_id: "org-1",
      created_by: "user-1",
      updated_by: "user-1",
      assigned_to: "user-1"
    });
    mockGetLlmEnrichmentStatus.mockReturnValue({
      enabled: true,
      reason: "LLM enrichment is enabled."
    });
    mockCreateAgentHandlerDependencies.mockResolvedValue({
      enrichProspectCandidate: vi.fn()
    });
    mockQueueAgent.mockResolvedValue({
      ok: true,
      execution: { id: "exec-1" }
    });
  });

  it("returns a safe disabled message when LLM enrichment is off", async () => {
    mockGetLlmEnrichmentStatus.mockReturnValue({
      enabled: false,
      reason: "LLM enrichment is disabled. Set LLM_ENRICHMENT_ENABLED=true to enable."
    });

    const { enrichProspectCandidate } = await import("@/lib/actions/prospectCandidates");
    const result = await enrichProspectCandidate("candidate-1");

    expect(result).toEqual({
      ok: false,
      error: "LLM enrichment is disabled. Set LLM_ENRICHMENT_ENABLED=true to enable.",
      disabled: true
    });
    expect(mockGetServerSupabaseClient).not.toHaveBeenCalled();
    expect(mockQueueAgent).not.toHaveBeenCalled();
  });

  it("rejects users without mutation permissions", async () => {
    mockRequireRole.mockResolvedValue(null);
    const supabase = buildSupabaseMock();
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { enrichProspectCandidate } = await import("@/lib/actions/prospectCandidates");
    const result = await enrichProspectCandidate("candidate-1");

    expect(result).toEqual({
      ok: false,
      error: "You do not have permission to review prospects."
    });
    expect(mockQueueAgent).not.toHaveBeenCalled();
  });

  it("only queues enrichment for pending review candidates", async () => {
    const supabase = buildSupabaseMock({
      candidate: { ...pendingCandidate, status: "approved" }
    });
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { enrichProspectCandidate } = await import("@/lib/actions/prospectCandidates");
    const result = await enrichProspectCandidate("candidate-1");

    expect(result).toEqual({
      ok: false,
      error: "Only pending review candidates can be enriched."
    });
    expect(mockQueueAgent).not.toHaveBeenCalled();
  });

  it("queues enrichment and marks the candidate queued without calling the LLM", async () => {
    const supabase = buildSupabaseMock();
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { enrichProspectCandidate } = await import("@/lib/actions/prospectCandidates");
    const result = await enrichProspectCandidate("candidate-1");

    expect(result).toEqual({
      ok: true,
      message:
        "Enrichment queued for Howard University. The background worker will process it shortly."
    });
    expect(mockQueueAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: "ProspectEnrichmentAgent",
        targetType: "prospect_candidate",
        targetId: "candidate-1",
        organizationId: "org-1"
      })
    );
    expect(supabase.updatedCandidates[0]).toEqual({
      enrichment_status: "queued"
    });
    expect(mockRecordAuditEvent).toHaveBeenCalledOnce();
    expect(mockRecordAuditEvent.mock.calls[0][1]).toMatchObject({
      action: "prospect_candidate.enrich",
      metadata: {
        job_id: "job-1",
        outcome: "queued",
        agent_execution_id: "exec-1"
      }
    });
  });

  it("marks budget_denied when queueing is rejected for budget limits", async () => {
    const supabase = buildSupabaseMock();
    mockGetServerSupabaseClient.mockResolvedValue(supabase);
    mockQueueAgent.mockResolvedValue({
      ok: false,
      error: "Daily AI usage limit reached.",
      reason_code: "daily_budget_limit"
    });

    const { enrichProspectCandidate } = await import("@/lib/actions/prospectCandidates");
    const result = await enrichProspectCandidate("candidate-1");

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected failure");
    }
    expect(result.error).toMatch(/Daily AI usage limit/i);
    expect(supabase.updatedCandidates[0]).toEqual({
      enrichment_status: "budget_denied"
    });
  });

  it("refuses to queue when enrichment is already in progress", async () => {
    const supabase = buildSupabaseMock({
      candidate: { ...pendingCandidate, enrichment_status: "running" }
    });
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { enrichProspectCandidate } = await import("@/lib/actions/prospectCandidates");
    const result = await enrichProspectCandidate("candidate-1");

    expect(result).toEqual({
      ok: false,
      error: "Enrichment is already in progress for this candidate."
    });
    expect(mockQueueAgent).not.toHaveBeenCalled();
  });
});
