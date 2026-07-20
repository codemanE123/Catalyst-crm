import { describe, expect, it } from "vitest";

import { buildManualMeetingImportDraft } from "@/lib/meetingImports/buildManualDraft";
import { DIGEST_MAX_CHARS } from "@/lib/meetingImports/types";

describe("buildManualMeetingImportDraft", () => {
  it("requires digest text", () => {
    expect(
      buildManualMeetingImportDraft({
        organizationId: "org-1",
        digestText: "   "
      })
    ).toEqual({ error: "Paste a meeting digest before submitting." });
  });

  it("builds a manual draft with redaction and truncation", () => {
    const result = buildManualMeetingImportDraft({
      organizationId: "org-1",
      digestText: "Spoke with dean@stateu.edu about pilot timing.",
      meetingTitle: "Discovery call",
      meetingDate: "2026-07-20"
    });

    expect("error" in result).toBe(false);
    if ("error" in result) {
      return;
    }

    expect(result.provider).toBe("manual");
    expect(result.provider_meeting_id.startsWith("manual-")).toBe(true);
    expect(result.meeting_title).toBe("Discovery call");
    expect(result.digest_text).toContain("[redacted-email]");
    expect(result.digest_text).not.toContain("dean@stateu.edu");
    expect(result.meeting_started_at?.startsWith("2026-07-20")).toBe(true);
  });

  it("truncates oversized digests and keeps an excerpt", () => {
    const huge = `${"x".repeat(DIGEST_MAX_CHARS + 100)}\nemail@school.edu`;
    const result = buildManualMeetingImportDraft({
      organizationId: "org-1",
      digestText: huge
    });

    expect("error" in result).toBe(false);
    if ("error" in result) {
      return;
    }

    expect(result.digest_text?.length).toBeLessThanOrEqual(DIGEST_MAX_CHARS);
    expect(result.transcript_excerpt).toBeTruthy();
  });
});
