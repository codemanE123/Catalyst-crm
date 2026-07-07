import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockRequireRole = vi.fn();
const mockGetRecordOwnershipFields = vi.fn();
const mockGetServerSupabaseClient = vi.fn();
const mockGetSchoolOrganizationId = vi.fn();
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
    requireRole: (...args: unknown[]) => mockRequireRole(...args),
    getSchoolOrganizationId: (...args: unknown[]) => mockGetSchoolOrganizationId(...args)
  };
});

vi.mock("@/lib/supabase", () => ({
  getRecordOwnershipFields: () => mockGetRecordOwnershipFields()
}));

vi.mock("@/lib/auditLog", () => ({
  AUDIT_ACTIONS: {
    prospectCandidateOutreachDraftSave: "prospect_candidate.outreach_draft_save",
    outreachCreate: "outreach.create"
  },
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args)
}));

const approvedCandidate = {
  id: "candidate-1",
  organization_id: "org-1",
  job_id: "job-1",
  status: "approved",
  name: "Howard University",
  website: "https://www.howard.edu",
  district: "Washington, DC",
  location: "Washington, DC",
  rationale: "HBCU with cybersecurity programs.",
  confidence_score: 0.91,
  source_name: "U.S. Department of Education College Scorecard",
  source_url: "https://collegescorecard.ed.gov/data/api/",
  promoted_school_id: "school-1",
  enrichment_summary: "Public HBCU with cybersecurity program signals.",
  outreach_angle: "Lead with workforce development alignment.",
  recommended_next_step: "Initial outreach - cyber workforce program",
  enrichment_status: "enriched",
  enriched_at: "2026-07-07T12:00:00.000Z",
  created_at: "2026-07-07T12:00:00.000Z",
  updated_at: "2026-07-07T12:00:00.000Z"
};

const draftText = `Subject: Partnership opportunity for Howard University

Hi there,

I am reaching out regarding Howard University's cybersecurity and workforce development programs.

Would you be open to a brief call next week?

Best,
Catalyst Partnerships Team`;

function buildSupabaseMock(options?: {
  candidate?: typeof approvedCandidate;
}) {
  const candidate = options?.candidate ?? approvedCandidate;
  const insertedOutreach: Array<Record<string, unknown>> = [];

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

      if (table === "outreach") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                insertedOutreach.push(payload);
                return { data: { id: "outreach-1" }, error: null };
              })
            }))
          }))
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    insertedOutreach
  };
}

describe("saveProspectOutreachDraft action", () => {
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
    mockGetSchoolOrganizationId.mockResolvedValue("org-1");
  });

  it("rejects pending candidates without a promoted school", async () => {
    const supabase = buildSupabaseMock({
      candidate: {
        ...approvedCandidate,
        status: "pending_review",
        promoted_school_id: null
      }
    });
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { saveProspectOutreachDraft } = await import("@/lib/actions/prospectCandidates");
    const result = await saveProspectOutreachDraft("candidate-1", draftText);

    expect(result).toEqual({
      ok: false,
      error:
        "Save to outreach is only available for approved candidates with a promoted school."
    });
  });

  it("saves a draft outreach activity for an approved promoted candidate", async () => {
    const supabase = buildSupabaseMock();
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { saveProspectOutreachDraft } = await import("@/lib/actions/prospectCandidates");
    const result = await saveProspectOutreachDraft("candidate-1", draftText);

    expect(result).toEqual({
      ok: true,
      outreachId: "outreach-1",
      schoolId: "school-1",
      message:
        "Outreach draft saved to the CRM. Review it on the school record before sending."
    });
    expect(supabase.insertedOutreach[0]).toMatchObject({
      school_id: "school-1",
      channel: "Email",
      subject: "Partnership opportunity for Howard University",
      message: draftText,
      outcome: "Draft template (not sent)",
      next_step: "Initial outreach - cyber workforce program",
      organization_id: "org-1"
    });
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(2);
    expect(mockRevalidateSchoolViews).toHaveBeenCalledWith("school-1");
  });

  it("rejects users without mutation permissions", async () => {
    mockRequireRole.mockResolvedValue(null);
    const supabase = buildSupabaseMock();
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { saveProspectOutreachDraft } = await import("@/lib/actions/prospectCandidates");
    const result = await saveProspectOutreachDraft("candidate-1", draftText);

    expect(result).toEqual({
      ok: false,
      error: "You do not have permission to review prospects."
    });
  });
});
