import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockGetServerSupabaseClient = vi.fn();
const mockGetMembershipsForUser = vi.fn();
const mockRetryAgent = vi.fn();
const mockCancelAgent = vi.fn();
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
    getMembershipsForUser: (...args: unknown[]) => mockGetMembershipsForUser(...args)
  };
});

vi.mock("@/lib/agents/orchestrator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/orchestrator")>();
  return {
    ...actual,
    AgentOrchestrator: class {
      retryAgent = (...args: unknown[]) => mockRetryAgent(...args);
      cancelAgent = (...args: unknown[]) => mockCancelAgent(...args);
    }
  };
});

vi.mock("@/lib/agents/supabaseStore", () => ({
  SupabaseAgentExecutionStore: class {},
  createSupabaseAgentAuditRecorder: () => undefined
}));

vi.mock("@/lib/auditLog", () => ({
  recordAuditEvent: vi.fn()
}));

describe("agent operations actions", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireUser.mockReset();
    mockGetServerSupabaseClient.mockReset();
    mockGetMembershipsForUser.mockReset();
    mockRetryAgent.mockReset();
    mockCancelAgent.mockReset();
    mockRevalidatePath.mockReset();
  });

  it("denies sales users from retrying executions", async () => {
    mockGetServerSupabaseClient.mockResolvedValue({ from: vi.fn() });
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetMembershipsForUser.mockResolvedValue([
      {
        id: "m-1",
        organization_id: "org-1",
        user_id: "user-1",
        role: "sales",
        created_at: "2026-07-07T12:00:00.000Z",
        updated_at: "2026-07-07T12:00:00.000Z"
      }
    ]);

    const { retryAgentExecution } = await import("@/lib/actions/agentOperations");
    const result = await retryAgentExecution({
      executionId: "exec-1",
      organizationId: "org-1"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Only admins");
    }
    expect(mockRetryAgent).not.toHaveBeenCalled();
  });

  it("retries failed executions for org admins", async () => {
    mockGetServerSupabaseClient.mockResolvedValue({ from: vi.fn() });
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetMembershipsForUser.mockResolvedValue([
      {
        id: "m-1",
        organization_id: "org-1",
        user_id: "user-1",
        role: "admin",
        created_at: "2026-07-07T12:00:00.000Z",
        updated_at: "2026-07-07T12:00:00.000Z"
      }
    ]);
    mockRetryAgent.mockResolvedValue({
      ok: true,
      execution: { id: "exec-1", status: "queued" }
    });

    const { retryAgentExecution } = await import("@/lib/actions/agentOperations");
    const result = await retryAgentExecution({
      executionId: "exec-1",
      organizationId: "org-1"
    });

    expect(result.ok).toBe(true);
    expect(mockRetryAgent).toHaveBeenCalledWith({
      organizationId: "org-1",
      executionId: "exec-1",
      actorUserId: "user-1"
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/agents");
  });

  it("cancels queued executions for org admins", async () => {
    mockGetServerSupabaseClient.mockResolvedValue({ from: vi.fn() });
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetMembershipsForUser.mockResolvedValue([
      {
        id: "m-1",
        organization_id: "org-1",
        user_id: "user-1",
        role: "admin",
        created_at: "2026-07-07T12:00:00.000Z",
        updated_at: "2026-07-07T12:00:00.000Z"
      }
    ]);
    mockCancelAgent.mockResolvedValue({
      ok: true,
      execution: { id: "exec-1", status: "cancelled" }
    });

    const { cancelAgentExecution } = await import("@/lib/actions/agentOperations");
    const result = await cancelAgentExecution({
      executionId: "exec-1",
      organizationId: "org-1"
    });

    expect(result.ok).toBe(true);
    expect(mockCancelAgent).toHaveBeenCalledWith({
      organizationId: "org-1",
      executionId: "exec-1",
      actorUserId: "user-1"
    });
  });

  it("denies retry for another organization", async () => {
    mockGetServerSupabaseClient.mockResolvedValue({ from: vi.fn() });
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetMembershipsForUser.mockResolvedValue([
      {
        id: "m-1",
        organization_id: "org-1",
        user_id: "user-1",
        role: "admin",
        created_at: "2026-07-07T12:00:00.000Z",
        updated_at: "2026-07-07T12:00:00.000Z"
      }
    ]);

    const { retryAgentExecution } = await import("@/lib/actions/agentOperations");
    const result = await retryAgentExecution({
      executionId: "exec-1",
      organizationId: "org-2"
    });

    expect(result.ok).toBe(false);
    expect(mockRetryAgent).not.toHaveBeenCalled();
  });
});
