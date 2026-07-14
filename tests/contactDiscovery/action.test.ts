import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockRequireRole = vi.fn();
const mockGetRecordOwnershipFields = vi.fn();
const mockGetServerSupabaseClient = vi.fn();
const mockExecuteContactDiscovery = vi.fn();
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

vi.mock("@/lib/contactDiscovery/execute", () => ({
  executeContactDiscovery: (...args: unknown[]) => mockExecuteContactDiscovery(...args)
}));

vi.mock("@/lib/agents/pilot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/pilot")>();
  return {
    ...actual,
    assertRealProviderPilotAccess: vi.fn(async () => ({ ok: true }))
  };
});

describe("runContactDiscoveryForCandidate", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireUser.mockReset();
    mockRequireRole.mockReset();
    mockGetRecordOwnershipFields.mockReset();
    mockGetServerSupabaseClient.mockReset();
    mockExecuteContactDiscovery.mockReset();
    mockRevalidatePath.mockReset();
  });

  it("requires mutation role and persists recommendations for review", async () => {
    mockGetServerSupabaseClient.mockResolvedValue({ from: vi.fn() });
    mockRequireUser.mockResolvedValue({ id: "user-1", email: "sales@example.com" });
    mockGetRecordOwnershipFields.mockResolvedValue({ organization_id: "org-1" });
    mockRequireRole.mockResolvedValue({ role: "sales" });
    mockExecuteContactDiscovery.mockResolvedValue({
      ok: true,
      recommendations: [
        {
          id: "rec-1",
          recommended_title: "Corporate Partnerships Director",
          review_status: "pending_review"
        }
      ]
    });

    const { runContactDiscoveryForCandidate } = await import(
      "@/lib/actions/contactDiscovery"
    );

    const result = await runContactDiscoveryForCandidate("candidate-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recommendations).toHaveLength(1);
      expect(result.message).toContain("recommended contact roles");
    }

    expect(mockExecuteContactDiscovery).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "user-1",
        targetType: "prospect_candidate",
        targetId: "candidate-1"
      })
    );
  });
});
