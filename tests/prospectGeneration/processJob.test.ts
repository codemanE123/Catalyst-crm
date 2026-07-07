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
    prospectJobRun: "prospect.job_run",
    prospectJobComplete: "prospect.job_complete",
    prospectJobFail: "prospect.job_fail"
  },
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args)
}));

const queuedJob = {
  id: "job-1",
  organization_id: "org-1",
  created_by: "user-1",
  job_type: "discover_prospects",
  status: "queued",
  input: {
    geography: "Southeast US",
    schoolTypes: ["hbcu", "cae"],
    keywords: "cybersecurity",
    maxResults: 5
  },
  summary: null,
  error_code: null,
  error_message: null,
  started_at: null,
  completed_at: null,
  created_at: "2026-07-07T12:00:00.000Z",
  updated_at: "2026-07-07T12:00:00.000Z"
};

function buildProcessForm(jobId = "job-1") {
  const formData = new FormData();
  formData.set("job_id", jobId);
  return formData;
}

function buildSupabaseMock(options?: { insertFails?: boolean }) {
  let jobStatus = "queued";
  const insertedCandidates: Array<Record<string, unknown>> = [];

  return {
    from: vi.fn((table: string) => {
      if (table === "prospect_generation_jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { ...queuedJob, status: jobStatus },
                  error: null
                }))
              }))
            }))
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => {
                      if (payload.status === "running") {
                        jobStatus = "running";
                        return { data: { id: "job-1" }, error: null };
                      }

                      return { data: null, error: null };
                    }),
                    single: vi.fn(async () => {
                      jobStatus = String(payload.status);
                      return {
                        data: {
                          ...queuedJob,
                          status: payload.status,
                          summary: payload.summary ?? null,
                          completed_at: payload.completed_at ?? null,
                          started_at: payload.started_at ?? queuedJob.started_at
                        },
                        error: null
                      };
                    })
                  }))
                }))
              }))
            }))
          }))
        };
      }

      if (table === "prospect_candidates") {
        return {
          insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
            if (options?.insertFails) {
              return { error: { message: "insert failed" } };
            }

            insertedCandidates.push(...rows);
            return { error: null };
          })
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    insertedCandidates,
    getJobStatus: () => jobStatus
  };
}

describe("processProspectGenerationJob", () => {
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

  it("runs a queued job and inserts mock candidates", async () => {
    const supabase = buildSupabaseMock();
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { processProspectGenerationJob } = await import("@/lib/actions/prospectGeneration");
    const result = await processProspectGenerationJob(buildProcessForm());

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.job.status).toBe("completed");
      expect(result.candidateCount).toBeGreaterThan(0);
    }

    expect(supabase.insertedCandidates.length).toBeGreaterThan(0);
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(2);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/prospects/generate");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/prospects/jobs/job-1/review");
  });

  it("marks the job failed when candidate inserts fail", async () => {
    const supabase = buildSupabaseMock({ insertFails: true });
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { processProspectGenerationJob } = await import("@/lib/actions/prospectGeneration");
    const result = await processProspectGenerationJob(buildProcessForm());

    expect(result).toEqual({
      ok: false,
      error: "Could not save generated prospect candidates."
    });
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(2);
  });

  it("rejects non-queued jobs", async () => {
    const supabase = buildSupabaseMock();
    supabase.from = vi.fn((table: string) => {
      if (table === "prospect_generation_jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { ...queuedJob, status: "completed" },
                  error: null
                }))
              }))
            }))
          }))
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
    mockGetServerSupabaseClient.mockResolvedValue(supabase);

    const { processProspectGenerationJob } = await import("@/lib/actions/prospectGeneration");
    const result = await processProspectGenerationJob(buildProcessForm());

    expect(result).toEqual({
      ok: false,
      error: "Only queued jobs can generate candidates."
    });
  });
});
