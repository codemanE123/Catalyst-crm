import { describe, expect, it } from "vitest";

import {
  buildProspectOutreachDraftNextStep,
  parseOutreachDraftSubject,
  validateProspectOutreachDraftText
} from "@/lib/prospectOutreachDraftSave";

describe("validateProspectOutreachDraftText", () => {
  it("rejects empty drafts", () => {
    expect(validateProspectOutreachDraftText("   ")).toEqual({
      ok: false,
      error: "Enter an outreach draft before saving."
    });
  });

  it("accepts a trimmed draft within limits", () => {
    const draft = "Subject: Hello\n\nThis is a reviewed outreach draft body.";

    expect(validateProspectOutreachDraftText(`  ${draft}  `)).toEqual({
      ok: true,
      draft
    });
  });
});

describe("parseOutreachDraftSubject", () => {
  it("extracts the subject line when present", () => {
    expect(
      parseOutreachDraftSubject(
        "Subject: Partnership opportunity\n\nBody text",
        "Fallback"
      )
    ).toBe("Partnership opportunity");
  });

  it("uses the fallback when no subject line exists", () => {
    expect(parseOutreachDraftSubject("Body only", "Fallback subject")).toBe(
      "Fallback subject"
    );
  });
});

describe("buildProspectOutreachDraftNextStep", () => {
  it("uses the recommended next step when available", () => {
    expect(buildProspectOutreachDraftNextStep("Schedule discovery call")).toBe(
      "Schedule discovery call"
    );
  });

  it("falls back to a manual review step", () => {
    expect(buildProspectOutreachDraftNextStep(null)).toBe(
      "Review draft and send manually."
    );
  });
});
