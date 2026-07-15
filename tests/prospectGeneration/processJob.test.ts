import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockRequireRole = vi.fn();
const mockGetRecordOwnershipFields = vi.fn();
const mockGetServerSupabaseClient = vi.fn();
const mockRecordAuditEvent = vi.fn();
const mockRevalidatePath = vi.fn();
const mockQueueAgent = vi.fn();
const mockCreateGatedOrchestrator = vi.fn();
const mockCreateHandlerDeps = vi.fn();

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
    prospectJobCreate: "prospect.job_create",
    prospectWebDiscoveryQueued: "prospect.web_discovery_queued",
    prospectProviderNotConfigured: "prospect.provider_not_configured"
  },
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args)
}));

vi.mock("@/lib/agents/pilot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/pilot")>();
  return {
    ...actual,
    assertRealProviderPilotAccess: vi.fn(async () => ({ ok: true }))
  };
});

vi.mock("@/lib/actions/agentHandlerDependencies", () => ({
  createAgentHandlerDependencies: (...args: unknown[]) =>
    mockCreateHandlerDeps(...args)
}));

vi.mock("@/lib/agents/worker", () => ({
  createGatedAgentOrchestratorFromSupabase: (...args: unknown[]) =>
    mockCreateGatedOrchestrator(...args)
}));

vi.mock("@/lib/agents/usageStore", () => ({
  SupabaseAgentUsageStore: vi.fn()
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
    mockCreateHandlerDeps.mockResolvedValue({});
    mockQueueAgent.mockResolvedValue({
      ok: true,
      execution: { id: "exec-1" }
    });
    mockCreateGatedOrchestrator.mockReturnValue({
      queueAgent: (...args: unknown[]) => mockQueueAgent(...args)
    });
  });

  it("queues an agent execution and returns quickly without crawling", async () => {
    mockGetServerSupabaseClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: queuedJob,
                error: null
              }))
            }))
          }))
        }))
      }))
    });

    const { processProspectGenerationJob } = await import(
      "@/lib/actions/prospectGeneration"
    );
    const result = await processProspectGenerationJob(buildProcessForm());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.queued).toBe(true);
      expect(result.message).toBe("Generation queued.");
      expect(result.job.status).toBe("queued");
    }

    expect(mockQueueAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: "ProspectGenerationAgent",
        targetType: "prospect_generation_job",
        targetId: "job-1"
      })
    );
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "prospect.web_discovery_queued"
      })
    );
  });

  it("rejects non-queued jobs", async () => {
    mockGetServerSupabaseClient.mockResolvedValue({
      from: vi.fn(() => ({
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
      }))
    });

    const { processProspectGenerationJob } = await import(
      "@/lib/actions/prospectGeneration"
    );
    const result = await processProspectGenerationJob(buildProcessForm());

    expect(result).toEqual({
      ok: false,
      error: "Only queued jobs can generate candidates."
    });
    expect(mockQueueAgent).not.toHaveBeenCalled();
  });
});
