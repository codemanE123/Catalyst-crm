import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockRequireRole = vi.fn();
const mockGetRecordOwnershipFields = vi.fn();
const mockGetServerSupabaseClient = vi.fn();
const mockExecuteMeetingPrep = vi.fn();
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

vi.mock("@/lib/meetingPrep/execute", () => ({
  executeMeetingPrep: (...args: unknown[]) => mockExecuteMeetingPrep(...args)
}));

describe("runMeetingPrepForSchool", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireUser.mockReset();
    mockRequireRole.mockReset();
    mockGetRecordOwnershipFields.mockReset();
    mockGetServerSupabaseClient.mockReset();
    mockExecuteMeetingPrep.mockReset();
    mockRevalidatePath.mockReset();
  });

  it("requires mutation role and stores brief for human review", async () => {
    mockGetServerSupabaseClient.mockResolvedValue({ from: vi.fn() });
    mockRequireUser.mockResolvedValue({ id: "user-1", email: "sales@example.com" });
    mockGetRecordOwnershipFields.mockResolvedValue({ organization_id: "org-1" });
    mockRequireRole.mockResolvedValue({ role: "sales" });
    mockExecuteMeetingPrep.mockResolvedValue({
      ok: true,
      brief: {
        id: "brief-1",
        meeting_objective: "Prepare for discovery meeting.",
        review_status: "pending_review"
      }
    });

    const { runMeetingPrepForSchool } = await import("@/lib/actions/meetingPrep");

    const result = await runMeetingPrepForSchool("school-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toContain("human review");
    }

    expect(mockExecuteMeetingPrep).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "user-1",
        targetType: "school",
        targetId: "school-1"
      })
    );
  });
});
