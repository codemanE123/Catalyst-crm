import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockRequireRole = vi.fn();
const mockGetRecordOwnershipFields = vi.fn();
const mockGetServerSupabaseClient = vi.fn();
const mockRecordAuditEvent = vi.fn();
const mockGetProspectOutreachDraftStatus = vi.fn();
const mockGenerateProspectOutreachDraftWithLlm = vi.fn();
const mockResolveLlmProductionContext = vi.fn();

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
    prospectCandidateOutreachDraft: "prospect_candidate.outreach_draft"
  },
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args)
}));

vi.mock("@/lib/agents/usageStore", () => ({
  SupabaseAgentUsageStore: class {
    insert = vi.fn(async () => ({
      id: "usage-1",
      organization_id: "org-1",
      agent_execution_id: null,
      agent_name: "OutreachDraftAgent",
      target_type: "prospect_candidate",
      target_id: "candidate-1",
      provider: "openai",
      model: null,
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      estimated_cost_usd: null,
      status: "denied",
      denial_reason_code: null,
      created_at: "2026-07-14T12:00:00.000Z"
    }));
    countLlmCallsSince = vi.fn(async () => 0);
    sumEstimatedCostSince = vi.fn(async () => 0);
  }
}));

vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...actual,
    resolveLlmProductionContextFromSupabase: (...args: unknown[]) =>
      mockResolveLlmProductionContext(...args)
  };
});

vi.mock("@/lib/llm/outreachDraft", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/outreachDraft")>();
  return {
    ...actual,
    getProspectOutreachDraftStatus: () => mockGetProspectOutreachDraftStatus(),
    generateProspectOutreachDraftWithLlm: (...args: unknown[]) =>
      mockGenerateProspectOutreachDraftWithLlm(...args)
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
  enrichment_summary: "Public HBCU with cybersecurity program signals.",
  outreach_angle: "Lead with workforce development alignment.",
  recommended_next_step: "Initial outreach - cyber workforce program",
  enrichment_status: "enriched",
  enriched_at: "2026-07-07T12:00:00.000Z",
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
    })
  };
}

describe("generateProspectOutreachDraft action", () => {
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
    mockGetProspectOutreachDraftStatus.mockReturnValue({
      enabled: true,
      reason: "AI outreach drafts are enabled."
    });
    mockResolveLlmProductionContext.mockResolvedValue({
      ok: true,
      context: {
        agentName: "OutreachDraftAgent",
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

  it("returns a safe disabled message when LLM is off", async () => {
    mockGetProspectOutreachDraftStatus.mockReturnValue({
      enabled: false,
      reason: "LLM enrichment is disabled. Set LLM_ENRICHMENT_ENABLED=true to enable."
    });

    const { generateProspectOutreachDraft } = await import("@/lib/actions/prospectCandidates");
    const result = await generateProspectOutreachDraft("candidate-1");

    expect(result).toEqual({
      ok: false,
      error: "LLM enrichment is disabled. Set LLM_ENRICHMENT_ENABLED=true to enable.",
      disabled: true
    });
    expect(mockGetServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("allows approved candidates to generate drafts", async () => {
    const supabase = buildSupabaseMock({
      candidate: { ...pendingCandidate, status: "approved", promoted_school_id: "school-1" }
    });
    mockGetServerSupabaseClient.mockResolvedValue(supabase);
    mockGenerateProspectOutreachDraftWithLlm.mockResolvedValue({
      ok: true,
      status: "draft_ready",
      provider: "openai",
      model: "gpt-4o-mini",
      prompt_version: "prospect.outreach_draft.v1",
      data: { draft_text: "Subject: Hello\n\nDraft body for review." },
      usage: { input_tokens: 100, output_tokens: 80 }
    });

    const { generateProspectOutreachDraft } = await import("@/lib/actions/prospectCandidates");
    const result = await generateProspectOutreachDraft("candidate-1");

    expect(result).toEqual({
      ok: true,
      draft: "Subject: Hello\n\nDraft body for review."
    });
    expect(mockGenerateProspectOutreachDraftWithLlm.mock.calls[0][0].input).toMatchObject({
      organization_name: "Howard University"
    });
    expect(mockGenerateProspectOutreachDraftWithLlm.mock.calls[0][0].input).not.toHaveProperty(
      "rationale"
    );
    expect(mockRecordAuditEvent).toHaveBeenCalledOnce();
  });

  it("rejects rejected candidates", async () => {
    const supabase = buildSupabaseMock({
      candidate: { ...pendingCandidate, status: "rejected" }
    });
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { generateProspectOutreachDraft } = await import("@/lib/actions/prospectCandidates");
    const result = await generateProspectOutreachDraft("candidate-1");

    expect(result).toEqual({
      ok: false,
      error: "Outreach drafts are only available for pending or approved candidates."
    });
    expect(mockGenerateProspectOutreachDraftWithLlm).not.toHaveBeenCalled();
  });
});
