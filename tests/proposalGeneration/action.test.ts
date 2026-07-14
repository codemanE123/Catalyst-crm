import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockRequireRole = vi.fn();
const mockGetRecordOwnershipFields = vi.fn();
const mockGetServerSupabaseClient = vi.fn();
const mockExecuteProposalGeneration = vi.fn();
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

vi.mock("@/lib/proposalGeneration/execute", () => ({
  executeProposalGeneration: (...args: unknown[]) => mockExecuteProposalGeneration(...args)
}));

vi.mock("@/lib/agents/pilot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/pilot")>();
  return {
    ...actual,
    assertRealProviderPilotAccess: vi.fn(async () => ({ ok: true }))
  };
});

describe("runProposalGenerationForSchool", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireUser.mockReset();
    mockRequireRole.mockReset();
    mockGetRecordOwnershipFields.mockReset();
    mockGetServerSupabaseClient.mockReset();
    mockExecuteProposalGeneration.mockReset();
    mockRevalidatePath.mockReset();
  });

  it("requires mutation role and stores draft for human review", async () => {
    mockGetServerSupabaseClient.mockResolvedValue({ from: vi.fn() });
    mockRequireUser.mockResolvedValue({ id: "user-1", email: "sales@example.com" });
    mockGetRecordOwnershipFields.mockResolvedValue({ organization_id: "org-1" });
    mockRequireRole.mockResolvedValue({ role: "sales" });
    mockExecuteProposalGeneration.mockResolvedValue({
      ok: true,
      draft: {
        id: "draft-1",
        proposal_title: "Example × SecureCell Partnership Proposal (Draft)",
        review_status: "pending_review"
      }
    });

    const { runProposalGenerationForSchool } = await import(
      "@/lib/actions/proposalGeneration"
    );

    const result = await runProposalGenerationForSchool("school-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toContain("human review");
    }

    expect(mockExecuteProposalGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "user-1",
        targetType: "school",
        targetId: "school-1"
      })
    );
  });
});
