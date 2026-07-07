import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockRequireRole = vi.fn();
const mockGetRecordOwnershipFields = vi.fn();
const mockGetServerSupabaseClient = vi.fn();
const mockRecordAuditEvent = vi.fn();
const mockRevalidatePath = vi.fn();
const mockRevalidateSchoolViews = vi.fn();

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
    prospectCandidateApprove: "prospect_candidate.approve",
    prospectCandidateReject: "prospect_candidate.reject",
    schoolCreate: "school.create"
  },
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args)
}));

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
  promoted_school_id: null,
  source_name: "U.S. Department of Education College Scorecard",
  source_url: "https://collegescorecard.ed.gov/data/api/",
  enrichment_summary: null,
  outreach_angle: null,
  recommended_next_step: null,
  enrichment_status: "not_enriched",
  enriched_at: null,
  created_at: "2026-07-07T12:00:00.000Z",
  updated_at: "2026-07-07T12:00:00.000Z"
};

function buildReviewForm(candidateId = "candidate-1", jobId = "job-1") {
  const formData = new FormData();
  formData.set("candidate_id", candidateId);
  formData.set("job_id", jobId);
  return formData;
}

function buildSupabaseMock(options?: {
  candidate?: typeof pendingCandidate;
  duplicateSchoolId?: string | null;
}) {
  const candidate = options?.candidate ?? pendingCandidate;
  const updatedCandidates: Array<Record<string, unknown>> = [];
  const insertedSchools: Array<Record<string, unknown>> = [];

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
                  data: { status: "completed" },
                  error: null
                }))
              }))
            }))
          }))
        };
      }

      if (table === "schools") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: options?.duplicateSchoolId
                      ? { id: options.duplicateSchoolId }
                      : null,
                    error: null
                  }))
                }))
              }))
            }))
          })),
          insert: vi.fn((payload: Record<string, unknown>) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                insertedSchools.push(payload);
                return { data: { id: "school-1" }, error: null };
              })
            }))
          }))
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    updatedCandidates,
    insertedSchools
  };
}

describe("approveProspectCandidate", () => {
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
  });

  it("creates a school and marks the candidate approved", async () => {
    const supabase = buildSupabaseMock();
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { approveProspectCandidate } = await import("@/lib/actions/prospectCandidates");
    const result = await approveProspectCandidate(buildReviewForm());

    expect(result).toEqual({ ok: true, schoolId: "school-1" });
    expect(supabase.insertedSchools[0]).toMatchObject({
      name: "Howard University",
      status: "Prospect",
      next_step: "Initial outreach",
      organization_id: "org-1"
    });
    expect(supabase.updatedCandidates[0]).toEqual({
      status: "approved",
      promoted_school_id: "school-1"
    });
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(2);
    expect(mockRevalidateSchoolViews).toHaveBeenCalledWith("school-1");
  });

  it("returns a duplicate error when the school already exists", async () => {
    const supabase = buildSupabaseMock({ duplicateSchoolId: "existing-school" });
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { approveProspectCandidate } = await import("@/lib/actions/prospectCandidates");
    const result = await approveProspectCandidate(buildReviewForm());

    expect(result).toEqual({
      ok: false,
      error: "A school with this name already exists in your organization."
    });
  });

  it("rejects users without mutation permissions", async () => {
    mockRequireRole.mockResolvedValue(null);
    const supabase = buildSupabaseMock();
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { approveProspectCandidate } = await import("@/lib/actions/prospectCandidates");
    const result = await approveProspectCandidate(buildReviewForm());

    expect(result).toEqual({
      ok: false,
      error: "You do not have permission to review prospects."
    });
  });
});

describe("rejectProspectCandidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1", email: "sales@example.com" });
    mockRequireRole.mockResolvedValue({ role: "sales" });
    mockGetRecordOwnershipFields.mockResolvedValue({
      organization_id: "org-1",
      created_by: "user-1",
      updated_by: "user-1",
      assigned_to: "user-1"
    });
  });

  it("marks a pending candidate as rejected", async () => {
    const supabase = buildSupabaseMock();
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { rejectProspectCandidate } = await import("@/lib/actions/prospectCandidates");
    const result = await rejectProspectCandidate(buildReviewForm());

    expect(result).toEqual({ ok: true });
    expect(supabase.updatedCandidates[0]).toEqual({ status: "rejected" });
    expect(mockRecordAuditEvent).toHaveBeenCalledOnce();
  });
});
