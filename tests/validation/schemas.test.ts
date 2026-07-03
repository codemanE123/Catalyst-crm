import { describe, expect, it } from "vitest";

import {
  validateInterviewNote,
  validateUniversityResearchInput
} from "@/lib/validation";

const SCHOOL_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function interviewForm(
  overrides: Record<string, string> = {}
): FormData {
  const formData = new FormData();

  const defaults: Record<string, string> = {
    school_id: SCHOOL_ID,
    interviewer: "Alex Morgan",
    interview_date: "2026-07-03",
    sentiment: "Warm",
    pilot_interest: "High",
    pain_points: "Manual outreach tracking",
    next_step: "Send pilot overview"
  };

  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }

  return formData;
}

function researchForm(
  overrides: Record<string, string> = {}
): FormData {
  const formData = new FormData();

  const defaults: Record<string, string> = {
    school_name: "Oakwood University",
    website: "https://oakwood.edu"
  };

  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }

  return formData;
}

describe("validateInterviewNote", () => {
  it("accepts a valid discovery interview payload", () => {
    const result = validateInterviewNote(interviewForm());

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.school_id).toBe(SCHOOL_ID);
      expect(result.data.pain_points).toBe("Manual outreach tracking");
    }
  });

  it("accepts summary notes when pain points are omitted", () => {
    const result = validateInterviewNote(
      interviewForm({ pain_points: "", notes: "Strong institutional fit." })
    );

    expect(result.success).toBe(true);
  });

  it("rejects an invalid school id", () => {
    const result = validateInterviewNote(interviewForm({ school_id: "not-a-uuid" }));

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Select a valid school.");
    }
  });

  it("rejects a missing interviewer", () => {
    const result = validateInterviewNote(interviewForm({ interviewer: "" }));

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Interviewer is required.");
    }
  });

  it("rejects an invalid interview date format", () => {
    const result = validateInterviewNote(
      interviewForm({ interview_date: "07/03/2026" })
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Interview date must use YYYY-MM-DD.");
    }
  });

  it("requires interview summary or pain points", () => {
    const result = validateInterviewNote(
      interviewForm({ pain_points: "", notes: "" })
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Interview summary or pain points is required.");
    }
  });

  it("rejects fields that exceed max length", () => {
    const result = validateInterviewNote(
      interviewForm({ interviewer: "x".repeat(121) })
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Interviewer must be 120 characters or fewer.");
    }
  });

  it("rejects an invalid sentiment value", () => {
    const result = validateInterviewNote(interviewForm({ sentiment: "Unknown" }));

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Select a valid sentiment.");
    }
  });
});

describe("validateUniversityResearchInput", () => {
  it("accepts a valid research request", () => {
    const result = validateUniversityResearchInput(researchForm());

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.school_name).toBe("Oakwood University");
      expect(result.data.website).toBe("https://oakwood.edu");
    }
  });

  it("rejects an empty school name", () => {
    const result = validateUniversityResearchInput(researchForm({ school_name: "" }));

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Enter a school name to run the research agent.");
    }
  });

  it("rejects an invalid website URL", () => {
    const result = validateUniversityResearchInput(
      researchForm({ website: "not a valid url" })
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Invalid website URL.");
    }
  });

  it("allows an empty website", () => {
    const result = validateUniversityResearchInput(researchForm({ website: "" }));

    expect(result.success).toBe(true);
  });
});
