import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockRequireRole = vi.fn();
const mockGetRecordOwnershipFields = vi.fn();
const mockGetServerSupabaseClient = vi.fn();
const mockRecordAuditEvent = vi.fn();
const mockRevalidatePath = vi.fn();
const mockRevalidateSchoolViews = vi.fn();
const mockGetLlmEnrichmentStatus = vi.fn();
const mockInvokeLlmEnrichment = vi.fn();

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

vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...actual,
    getLlmEnrichmentStatus: () => mockGetLlmEnrichmentStatus(),
    enrichProspectCandidate: (...args: unknown[]) => mockInvokeLlmEnrichment(...args)
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

describe("enrichProspectCandidate action", () => {
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
    expect(mockInvokeLlmEnrichment).not.toHaveBeenCalled();
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
    expect(mockInvokeLlmEnrichment).not.toHaveBeenCalled();
  });

  it("only enriches pending review candidates", async () => {
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
    expect(mockInvokeLlmEnrichment).not.toHaveBeenCalled();
  });

  it("stores enrichment output and records audit metadata on success", async () => {
    const supabase = buildSupabaseMock();
    mockGetServerSupabaseClient.mockResolvedValue(supabase);
    mockInvokeLlmEnrichment.mockResolvedValue({
      ok: true,
      status: "enriched",
      provider: "openai",
      model: "gpt-4o-mini",
      prompt_version: "prospect.enrich.v1",
      data: {
        public_summary:
          "Howard University is a public HBCU in Washington, DC with cybersecurity-related program signals.",
        fit_rationale:
          "The institution aligns with the HBCU and cybersecurity-focused ICP for the Southeast geography.",
        outreach_angle: "Lead with workforce development and cybersecurity program alignment.",
        suggested_next_step: "Initial outreach - cyber workforce program",
        enrichment_confidence: 0.84,
        evidence_used: ["categories", "program_highlights"]
      },
      usage: { input_tokens: 120, output_tokens: 80 }
    });

    const { enrichProspectCandidate } = await import("@/lib/actions/prospectCandidates");
    const result = await enrichProspectCandidate("candidate-1");

    expect(result).toEqual({
      ok: true,
      message: "Howard University enriched successfully."
    });
    expect(supabase.updatedCandidates[0]).toMatchObject({
      enrichment_summary:
        "Howard University is a public HBCU in Washington, DC with cybersecurity-related program signals.",
      outreach_angle: "Lead with workforce development and cybersecurity program alignment.",
      recommended_next_step: "Initial outreach - cyber workforce program",
      enrichment_status: "enriched"
    });
    expect(mockInvokeLlmEnrichment).toHaveBeenCalledOnce();
    expect(mockInvokeLlmEnrichment.mock.calls[0][0].input).toMatchObject({
      institution: { name: "Howard University" },
      icp: { geography: "Southeast US" }
    });
    expect(mockInvokeLlmEnrichment.mock.calls[0][0].input).not.toHaveProperty("notes");
    expect(mockRecordAuditEvent).toHaveBeenCalledOnce();
    expect(mockRecordAuditEvent.mock.calls[0][1]).toMatchObject({
      action: "prospect_candidate.enrich",
      metadata: {
        job_id: "job-1",
        outcome: "enriched",
        provider: "openai"
      }
    });
  });

  it("records a failed enrichment outcome without storing private data", async () => {
    const supabase = buildSupabaseMock();
    mockGetServerSupabaseClient.mockResolvedValue(supabase);
    mockInvokeLlmEnrichment.mockResolvedValue({
      ok: false,
      status: "validation_failed",
      reason: "Prospect enrichment output did not match the schema."
    });

    const { enrichProspectCandidate } = await import("@/lib/actions/prospectCandidates");
    const result = await enrichProspectCandidate("candidate-1");

    expect(result).toEqual({
      ok: false,
      error: "Prospect enrichment output did not match the schema."
    });
    expect(supabase.updatedCandidates[0]).toEqual({
      enrichment_status: "failed"
    });
    expect(mockRecordAuditEvent).toHaveBeenCalledOnce();
  });
});
