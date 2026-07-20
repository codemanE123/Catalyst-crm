import { describe, expect, it } from "vitest";

import {
  flagsPossibleStudentPii,
  normalizeFirefliesPayload,
  redactPersonalData,
  truncateText
} from "@/lib/meetingImports/normalizeFireflies";
import { DIGEST_MAX_CHARS } from "@/lib/meetingImports/types";

describe("normalizeFirefliesPayload", () => {
  it("requires a meeting id", () => {
    const result = normalizeFirefliesPayload({
      payload: { title: "No id" },
      organizationId: "org-1"
    });
    expect(result).toEqual({ error: "Fireflies payload missing meetingId." });
  });

  it("normalizes webhook payload with transcript enrichment", () => {
    const result = normalizeFirefliesPayload({
      payload: {
        meetingId: "mtg-1",
        participants: ["dean@stateu.edu", { name: "Alex", email: "alex@example.com" }]
      },
      organizationId: "org-1",
      transcript: {
        title: "Partnership discovery",
        date: 1_700_000_000_000,
        duration: 3600,
        organizer_email: "owner@catalyst.test",
        summary: {
          overview: "Discussed dual enrollment pilot with contact@stateu.edu",
          action_items: "Send overview deck"
        },
        sentences: [
          { speaker_name: "Alex", text: "We liked the pilot idea." },
          { speaker_name: "Dean", text: "Budget review next month." }
        ],
        transcript_url: "https://app.fireflies.ai/view/mtg-1"
      }
    });

    expect("error" in result).toBe(false);
    if ("error" in result) {
      return;
    }

    expect(result.provider).toBe("fireflies");
    expect(result.provider_meeting_id).toBe("mtg-1");
    expect(result.meeting_title).toBe("Partnership discovery");
    expect(result.digest_text).toContain("dual enrollment");
    expect(result.digest_text).toContain("[redacted-email]");
    expect(result.digest_text).not.toContain("contact@stateu.edu");
    expect(result.transcript_excerpt).toContain("Alex:");
    expect(result.participants.some((p) => p.email === "owner@catalyst.test")).toBe(
      true
    );
    expect(result.source_url).toContain("fireflies.ai");
  });

  it("truncates oversized digests", () => {
    const huge = "x".repeat(DIGEST_MAX_CHARS + 200);
    const result = normalizeFirefliesPayload({
      payload: { meetingId: "mtg-2", digest: huge },
      organizationId: "org-1"
    });
    expect("error" in result).toBe(false);
    if ("error" in result) {
      return;
    }
    expect(result.digest_text?.length).toBeLessThanOrEqual(DIGEST_MAX_CHARS);
  });
});

describe("fireflies text helpers", () => {
  it("redacts emails and flags student hints", () => {
    expect(redactPersonalData("mail me at a@b.edu")).toBe("mail me at [redacted-email]");
    expect(flagsPossibleStudentPii("Student ID 12345 on the FERPA form")).toBe(true);
    expect(flagsPossibleStudentPii("Partnership roadmap")).toBe(false);
    expect(truncateText("abc", 10)).toBe("abc");
    expect(truncateText("abcdefghij", 5)).toBe("abcd…");
  });
});
