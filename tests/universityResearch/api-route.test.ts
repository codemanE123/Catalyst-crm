import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/university-research/route";

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

function buildRequest(schoolName: string, website = "") {
  const formData = new FormData();
  formData.set("school_name", schoolName);
  formData.set("website", website);

  return new Request("http://localhost/api/university-research", {
    method: "POST",
    body: formData
  });
}

describe("POST /api/university-research", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSupabaseClient.mockResolvedValue(null);
    mockEnforceRateLimit.mockResolvedValue({ allowed: true });
  });

  it("returns JSON for unauthenticated requests", async () => {
    mockRequireUser.mockResolvedValue(null);

    const response = await POST(buildRequest("Arizona State University", "https://www.asu.edu"));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.saved).toBe(false);
    expect(result.message).toBe("Sign in to run the research agent.");
  });

  it(
    "returns JSON for a public university website",
    async () => {
      mockRequireUser.mockResolvedValue({ id: "user-1" });
      mockRequireRole.mockResolvedValue({
        organization_id: "org-1",
        role: "admin"
      });

      const response = await POST(
        buildRequest("Arizona State University", "https://www.asu.edu")
      );
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.profile.name).toBe("Arizona State University");
      expect(result.profile.profile_sources.length).toBeLessThanOrEqual(3);
    },
    20000
  );
});
