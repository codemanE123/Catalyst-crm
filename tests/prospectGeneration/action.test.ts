import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockRequireRole = vi.fn();
const mockGetRecordOwnershipFields = vi.fn();
const mockGetServerSupabaseClient = vi.fn();
const mockRecordAuditEvent = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args)
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
    prospectJobCreate: "prospect.job_create"
  },
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args)
}));

function buildForm() {
  const formData = new FormData();
  formData.set("geography", "Southeast US");
  formData.append("school_types", "hbcu");
  formData.append("school_types", "cae");
  formData.set("keywords", "cybersecurity");
  formData.set("max_results", "25");
  return formData;
}

function buildSupabaseMock() {
  const insertedRows: Array<Record<string, unknown>> = [];

  return {
    from: vi.fn((table: string) => {
      if (table !== "prospect_generation_jobs") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        insert: vi.fn((payload: Record<string, unknown>) => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => {
              const row = {
                id: "job-1",
                organization_id: payload.organization_id,
                created_by: payload.created_by,
                job_type: payload.job_type,
                status: payload.status,
                input: payload.input,
                summary: null,
                error_code: null,
                error_message: null,
                started_at: null,
                completed_at: null,
                created_at: "2026-07-07T12:00:00.000Z",
                updated_at: "2026-07-07T12:00:00.000Z"
              };
              insertedRows.push(row);
              return { data: row, error: null };
            })
          }))
        }))
      };
    }),
    insertedRows
  };
}

describe("createProspectGenerationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockRequireRole.mockResolvedValue({ role: "sales" });
    mockGetRecordOwnershipFields.mockResolvedValue({
      organization_id: "org-1",
      created_by: "user-1",
      updated_by: "user-1",
      assigned_to: "user-1"
    });
  });

  it("queues a prospect generation job with validated input", async () => {
    const supabase = buildSupabaseMock();
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { createProspectGenerationJob } = await import(
      "@/lib/actions/prospectGeneration"
    );

    const result = await createProspectGenerationJob(buildForm());

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.job.status).toBe("queued");
      expect(result.job.input).toEqual({
        geography: "Southeast US",
        schoolTypes: ["hbcu", "cae"],
        keywords: "cybersecurity",
        maxResults: 25
      });
    }

    expect(mockRecordAuditEvent).toHaveBeenCalledOnce();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/prospects/generate");
  });

  it("rejects users without mutation permissions", async () => {
    mockRequireRole.mockResolvedValue(null);
    const supabase = buildSupabaseMock();
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { createProspectGenerationJob } = await import(
      "@/lib/actions/prospectGeneration"
    );

    const result = await createProspectGenerationJob(buildForm());

    expect(result).toEqual({
      ok: false,
      error: "You do not have permission to generate prospects."
    });
  });
});
