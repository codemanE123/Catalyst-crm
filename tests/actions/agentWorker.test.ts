import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockRequireRole = vi.fn();
const mockGetRecordOwnershipFields = vi.fn();
const mockGetServerSupabaseClient = vi.fn();
const mockProcessNext = vi.fn();

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

vi.mock("@/lib/agents/worker", () => ({
  createAgentWorkerFromSupabase: () => ({
    processNext: (...args: unknown[]) => mockProcessNext(...args)
  })
}));

describe("processNextAgentExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "admin-user" });
    mockGetRecordOwnershipFields.mockResolvedValue({
      organization_id: "org-1"
    });
    mockGetServerSupabaseClient.mockResolvedValue({});
    mockProcessNext.mockResolvedValue({
      ok: true,
      ran: false,
      message: "No queued agent executions are ready to run."
    });
  });

  it("denies non-admin users", async () => {
    mockRequireRole.mockResolvedValue(null);

    const { processNextAgentExecution } = await import("@/lib/actions/agentWorker");
    const result = await processNextAgentExecution();

    expect(result).toEqual({
      ok: false,
      error: "Only admins can process agent executions."
    });
    expect(mockProcessNext).not.toHaveBeenCalled();
  });

  it("processes one queued execution for admins", async () => {
    mockRequireRole.mockResolvedValue({ role: "admin" });
    mockProcessNext.mockResolvedValue({
      ok: true,
      ran: true,
      execution: {
        id: "exec-1",
        agent_name: "ProspectGenerationAgent",
        status: "completed"
      },
      message: "ProspectGenerationAgent completed successfully."
    });

    const { processNextAgentExecution } = await import("@/lib/actions/agentWorker");
    const result = await processNextAgentExecution();

    expect(result).toEqual({
      ok: true,
      ran: true,
      execution: {
        id: "exec-1",
        agent_name: "ProspectGenerationAgent",
        status: "completed"
      },
      message: "ProspectGenerationAgent completed successfully."
    });
    expect(mockProcessNext).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "admin-user"
    });
  });
});
