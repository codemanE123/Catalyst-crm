import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockRequireRole = vi.fn();
const mockGetServerSupabaseClient = vi.fn();
const mockEnforceRateLimit = vi.fn();

vi.mock("@/lib/supabaseServer", () => ({
  requireUser: () => mockRequireUser(),
  getServerSupabaseClient: () => mockGetServerSupabaseClient()
}));

vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return {
    ...actual,
    requireRole: (...args: unknown[]) => mockRequireRole(...args)
  };
});

vi.mock("@/lib/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rateLimit")>();
  return {
    ...actual,
    enforceRateLimit: (...args: unknown[]) => mockEnforceRateLimit(...args)
  };
});

function buildFormData(schoolName: string, website = "") {
  const formData = new FormData();
  formData.set("school_name", schoolName);
  formData.set("website", website);
  return formData;
}

describe("executeUniversityResearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSupabaseClient.mockResolvedValue(null);
    mockEnforceRateLimit.mockResolvedValue({ allowed: true });
  });

  it("returns a sign-in message when unauthenticated", async () => {
    mockRequireUser.mockResolvedValue(null);

    const { executeUniversityResearch } = await import("@/lib/universityResearch");
    const result = await executeUniversityResearch(
      buildFormData("Arizona State University", "https://www.asu.edu")
    );

    expect(result.saved).toBe(false);
    expect(result.message).toBe("Sign in to run the research agent.");
    expect(result.profile.name).toBe("");
  });

  it("returns a permission message for read-only users", async () => {
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockRequireRole.mockResolvedValue(null);

    const { executeUniversityResearch } = await import("@/lib/universityResearch");
    const result = await executeUniversityResearch(
      buildFormData("Arizona State University", "https://www.asu.edu")
    );

    expect(result.saved).toBe(false);
    expect(result.message).toBe(
      "You do not have permission to run the research agent."
    );
  });

  it("rejects blocked private URLs before fetching", async () => {
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockRequireRole.mockResolvedValue({
      organization_id: "org-1",
      role: "admin"
    });

    const { executeUniversityResearch } = await import("@/lib/universityResearch");
    const result = await executeUniversityResearch(
      buildFormData("Test University", "http://localhost")
    );

    expect(result.saved).toBe(false);
    expect(result.message).toBe(
      "Could not fetch a public school page. Check the website URL and try again."
    );
  });

  it(
    "researches a public university website without throwing",
    async () => {
      mockRequireUser.mockResolvedValue({ id: "user-1" });
      mockRequireRole.mockResolvedValue({
        organization_id: "org-1",
        role: "admin"
      });

      const { executeUniversityResearch } = await import("@/lib/universityResearch");
      const result = await executeUniversityResearch(
        buildFormData("Arizona State University", "https://www.asu.edu")
      );

      expect(result.message.length).toBeGreaterThan(0);
      expect(result.profile.name).toBe("Arizona State University");
      expect(result.profile.website).toMatch(/^https:\/\//);
      expect(result.profile.profile_sources.length).toBeLessThanOrEqual(3);
      expect(JSON.stringify(result)).toBe(JSON.stringify(result));
    },
    20000
  );
});
