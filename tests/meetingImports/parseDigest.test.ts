import { describe, expect, it } from "vitest";

import { parseMeetingDigestHeuristic } from "@/lib/meetingImports/parseDigest";

describe("parseMeetingDigestHeuristic", () => {
  it("extracts emails, sentiment, and action items", () => {
    const parsed = parseMeetingDigestHeuristic({
      meetingTitle: "Discovery with State U",
      digestText: [
        "Warm conversation with dean@stateu.edu.",
        "Pain points:",
        "Counselor capacity is limited.",
        "Action items:",
        "- Send pilot overview deck",
        "- Schedule follow-up next week",
        "Pilot interest: high"
      ].join("\n")
    });

    expect(parsed.attendees.some((row) => row.email === "dean@stateu.edu")).toBe(
      true
    );
    expect(parsed.discovery.sentiment).toBe("Warm");
    expect(parsed.discovery.pilot_interest).toBe("High");
    expect(parsed.action_items.length).toBeGreaterThanOrEqual(1);
    expect(parsed.discovery.pain_points).toContain("Counselor");
  });
});
