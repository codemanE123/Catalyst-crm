import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
const mockGetRecordOwnershipFields = vi.fn();
const mockGetServerSupabaseClient = vi.fn();

vi.mock("@/lib/supabaseServer", () => ({
  requireUser: () => mockRequireUser(),
  getServerSupabaseClient: () => mockGetServerSupabaseClient()
}));

vi.mock("@/lib/supabase", () => ({
  getRecordOwnershipFields: () => mockGetRecordOwnershipFields()
}));

function buildSupabaseMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === "schools") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              or: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: [
                      {
                        id: "school-1",
                        name: "Howard University",
                        location: "Washington, DC",
                        state: "DC",
                        status: "Prospect",
                        website: "https://www.howard.edu"
                      }
                    ],
                    error: null
                  }))
                }))
              }))
            }))
          }))
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            or: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({
                  data: [],
                  error: null
                }))
              }))
            }))
          }))
        }))
      };
    })
  };
}

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication", async () => {
    mockRequireUser.mockResolvedValue(null);

    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new Request("http://localhost/api/search?q=howard")
    );

    expect(response.status).toBe(401);
  });

  it("returns empty results for short queries", async () => {
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetRecordOwnershipFields.mockResolvedValue({
      organization_id: "org-1"
    });
    mockGetServerSupabaseClient.mockResolvedValue(buildSupabaseMock());

    const { GET } = await import("@/app/api/search/route");
    const response = await GET(new Request("http://localhost/api/search?q=a"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.schools).toEqual([]);
    expect(payload.contacts).toEqual([]);
  });

  it("returns organization-scoped search results", async () => {
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetRecordOwnershipFields.mockResolvedValue({
      organization_id: "org-1"
    });
    mockGetServerSupabaseClient.mockResolvedValue(buildSupabaseMock());

    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new Request("http://localhost/api/search?q=howard")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.schools).toHaveLength(1);
    expect(payload.schools[0].name).toBe("Howard University");
  });

  it("uses sample search results when Supabase is not configured", async () => {
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockGetRecordOwnershipFields.mockResolvedValue({
      organization_id: "org-1"
    });
    mockGetServerSupabaseClient.mockResolvedValue(null);

    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new Request("http://localhost/api/search?q=roosevelt")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.schools.some((school: { name: string }) => school.name.includes("Roosevelt"))).toBe(
      true
    );
  });
});
