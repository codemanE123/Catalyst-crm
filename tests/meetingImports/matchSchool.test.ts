import { describe, expect, it, vi } from "vitest";

import { matchSchoolForMeetingImport } from "@/lib/meetingImports/matchSchool";

function mockSupabase(schools: Array<{ id: string; name: string; website: string | null }>) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: schools, error: null }))
      }))
    }))
  } as never;
}

describe("matchSchoolForMeetingImport", () => {
  it("matches participant email domain to school website", async () => {
    const result = await matchSchoolForMeetingImport({
      supabase: mockSupabase([
        {
          id: "s1",
          name: "State University",
          website: "https://www.stateu.edu"
        }
      ]),
      organizationId: "org-1",
      participants: [{ email: "dean@admissions.stateu.edu" }],
      meetingTitle: null
    });

    expect(result.match_status).toBe("suggested");
    expect(result.school_id).toBe("s1");
    expect(result.match_confidence).toBe(0.85);
  });

  it("falls back to meeting title containing school name", async () => {
    const result = await matchSchoolForMeetingImport({
      supabase: mockSupabase([
        {
          id: "s2",
          name: "Riverdale College",
          website: null
        }
      ]),
      organizationId: "org-1",
      participants: [],
      meetingTitle: "Riverdale College partnership call"
    });

    expect(result.match_status).toBe("suggested");
    expect(result.school_id).toBe("s2");
    expect(result.match_confidence).toBe(0.7);
  });

  it("returns unmatched when no signal fits", async () => {
    const result = await matchSchoolForMeetingImport({
      supabase: mockSupabase([
        { id: "s3", name: "Other U", website: "https://other.edu" }
      ]),
      organizationId: "org-1",
      participants: [{ email: "person@gmail.com" }],
      meetingTitle: "Quick sync"
    });

    expect(result).toEqual({
      school_id: null,
      school_name: null,
      match_status: "unmatched",
      match_confidence: null
    });
  });
});
