import { describe, expect, it, vi } from "vitest";

import { searchGlobal } from "@/lib/globalSearch";

function buildSupabaseMock(options: {
  schools?: Array<Record<string, unknown>>;
  contacts?: Array<Record<string, unknown>>;
  schoolError?: boolean;
  contactError?: boolean;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "schools") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              or: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: options.schoolError ? null : (options.schools ?? []),
                    error: options.schoolError ? { message: "school error" } : null
                  }))
                }))
              }))
            }))
          }))
        };
      }

      if (table === "contacts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              or: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: options.contacts ?? [],
                    error: options.contactError ? { message: "contact error" } : null
                  }))
                }))
              }))
            }))
          }))
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    })
  };
}

describe("searchGlobal", () => {
  it("scopes queries to the organization and searches indexed fields", async () => {
    const supabase = buildSupabaseMock({
      schools: [
        {
          id: "school-1",
          name: "Howard University",
          location: "Washington, DC",
          state: "DC",
          status: "Prospect",
          website: "https://www.howard.edu"
        }
      ],
      contacts: [
        {
          id: "contact-1",
          name: "Dr. Elaine Foster",
          role: "Principal",
          email: "elaine@example.edu",
          school_id: "school-1",
          schools: { id: "school-1", name: "Howard University" }
        }
      ]
    });

    const results = await searchGlobal(
      supabase as never,
      "org-123",
      "howard"
    );

    expect(results?.schools).toHaveLength(1);
    expect(results?.contacts).toHaveLength(1);
    expect(supabase.from).toHaveBeenCalledWith("schools");
    expect(supabase.from).toHaveBeenCalledWith("contacts");
  });

  it("returns null for short queries", async () => {
    const supabase = buildSupabaseMock({});
    const results = await searchGlobal(supabase as never, "org-123", "a");
    expect(results).toBeNull();
  });

  it("throws when the database query fails", async () => {
    const supabase = buildSupabaseMock({ schoolError: true });

    await expect(
      searchGlobal(supabase as never, "org-123", "howard")
    ).rejects.toThrow("Could not run search.");
  });
});
