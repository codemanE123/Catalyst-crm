import { describe, expect, it } from "vitest";

import {
  isValidSchoolStatusTransition,
  validateCompleteFollowUp,
  validateCreateContact,
  validateCreateFollowUp,
  validateCreateSchool,
  validateInterviewNote,
  validateOutreachLog,
  validateUpdateContact,
  validateUpdateSchool,
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

function outreachForm(
  overrides: Record<string, string> = {}
): FormData {
  const formData = new FormData();

  const defaults: Record<string, string> = {
    school_id: SCHOOL_ID,
    channel: "Email",
    subject: "Pilot follow-up",
    outcome: "Left voicemail and sent overview deck.",
    outreach_date: "2026-07-06",
    next_step: "Schedule discovery call"
  };

  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }

  return formData;
}

describe("validateOutreachLog", () => {
  it("accepts a valid outreach payload", () => {
    const result = validateOutreachLog(outreachForm());

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.channel).toBe("Email");
      expect(result.data.subject).toBe("Pilot follow-up");
    }
  });

  it("rejects an invalid school id", () => {
    const result = validateOutreachLog(outreachForm({ school_id: "bad-id" }));

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Select a valid school.");
    }
  });

  it("rejects an invalid channel", () => {
    const result = validateOutreachLog(outreachForm({ channel: "SMS" }));

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Select a valid outreach channel.");
    }
  });

  it("rejects a missing next step", () => {
    const result = validateOutreachLog(outreachForm({ next_step: "" }));

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Next step is required.");
    }
  });
});

function createFollowUpForm(
  overrides: Record<string, string> = {}
): FormData {
  const formData = new FormData();

  const defaults: Record<string, string> = {
    school_id: SCHOOL_ID,
    title: "Send pilot deck",
    due_date: "2026-07-10",
    notes: "Include counselor workflow slide.",
    owner: "Alex Morgan"
  };

  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }

  return formData;
}

function completeFollowUpForm(
  overrides: Record<string, string> = {}
): FormData {
  const formData = new FormData();

  const defaults: Record<string, string> = {
    school_id: SCHOOL_ID,
    follow_up_id: "a1b2c3d4-e5f6-4789-a012-3456789abcde"
  };

  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }

  return formData;
}

describe("validateCreateFollowUp", () => {
  it("accepts a valid follow-up payload", () => {
    const result = validateCreateFollowUp(createFollowUpForm());

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.title).toBe("Send pilot deck");
      expect(result.data.owner).toBe("Alex Morgan");
    }
  });

  it("rejects a missing title", () => {
    const result = validateCreateFollowUp(createFollowUpForm({ title: "" }));

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Title is required.");
    }
  });

  it("rejects an invalid due date", () => {
    const result = validateCreateFollowUp(
      createFollowUpForm({ due_date: "07/10/2026" })
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Due date must use YYYY-MM-DD.");
    }
  });
});

describe("validateCompleteFollowUp", () => {
  it("accepts a valid complete payload", () => {
    const result = validateCompleteFollowUp(completeFollowUpForm());

    expect(result.success).toBe(true);
  });

  it("rejects an invalid follow-up id", () => {
    const result = validateCompleteFollowUp(
      completeFollowUpForm({ follow_up_id: "bad-id" })
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Select a valid follow-up.");
    }
  });
});

function schoolForm(
  overrides: Record<string, string> = {},
  includeSchoolId = false
): FormData {
  const formData = new FormData();

  const defaults: Record<string, string> = {
    name: "Oakwood University",
    website: "https://oakwood.edu",
    status: "Prospect",
    owner: "Alex Morgan",
    next_step: "Schedule discovery call",
    notes: "Priority HBCU target."
  };

  if (includeSchoolId) {
    defaults.school_id = SCHOOL_ID;
  }

  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }

  return formData;
}

describe("isValidSchoolStatusTransition", () => {
  it("allows forward transitions", () => {
    expect(isValidSchoolStatusTransition("Prospect", "Contacted")).toBe(true);
    expect(isValidSchoolStatusTransition("Contacted", "Partner")).toBe(true);
  });

  it("blocks backward transitions", () => {
    expect(isValidSchoolStatusTransition("Partner", "Prospect")).toBe(false);
    expect(isValidSchoolStatusTransition("Interviewing", "Contacted")).toBe(
      false
    );
  });
});

describe("validateCreateSchool", () => {
  it("accepts a valid school payload", () => {
    const result = validateCreateSchool(schoolForm());

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.name).toBe("Oakwood University");
      expect(result.data.status).toBe("Prospect");
    }
  });

  it("rejects an invalid website", () => {
    const result = validateCreateSchool(
      schoolForm({ website: "not a valid url" })
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Invalid website URL.");
    }
  });
});

describe("validateUpdateSchool", () => {
  it("accepts a valid update payload", () => {
    const result = validateUpdateSchool(schoolForm({}, true));

    expect(result.success).toBe(true);
  });

  it("rejects a missing school id", () => {
    const result = validateUpdateSchool(schoolForm({ school_id: "" }, true));

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Select a valid school.");
    }
  });
});

const CONTACT_ID = "b2c3d4e5-f6a7-4890-b123-456789abcdef";

function contactForm(
  overrides: Record<string, string> = {},
  includeIds = false
): FormData {
  const formData = new FormData();

  const defaults: Record<string, string> = {
    name: "Dr. Jane Smith",
    role: "Director of partnerships",
    email: "jane.smith@university.edu",
    phone: "555-0100",
    notes: "Primary decision-maker.",
    relationship: "Warm"
  };

  if (includeIds) {
    defaults.school_id = SCHOOL_ID;
  }

  if (overrides.contact_id !== undefined || includeIds === "update") {
    defaults.school_id = SCHOOL_ID;
    defaults.contact_id = CONTACT_ID;
  }

  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }

  return formData;
}

describe("validateCreateContact", () => {
  it("accepts a valid contact payload", () => {
    const result = validateCreateContact(contactForm({}, true));

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.email).toBe("jane.smith@university.edu");
    }
  });

  it("rejects an invalid email", () => {
    const result = validateCreateContact(
      contactForm({ email: "not-an-email" }, true)
    );

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Enter a valid email address.");
    }
  });
});

describe("validateUpdateContact", () => {
  it("accepts a valid update payload", () => {
    const formData = contactForm({}, true);
    formData.set("contact_id", CONTACT_ID);
    const result = validateUpdateContact(formData);

    expect(result.success).toBe(true);
  });

  it("rejects a missing contact id", () => {
    const result = validateUpdateContact(contactForm({ contact_id: "" }, true));

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toBe("Select a valid contact.");
    }
  });
});
