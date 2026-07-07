import { z } from "zod";

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type InterviewActionResult = {
  ok: boolean;
  error?: string;
};

export type OutreachActionResult = {
  ok: boolean;
  error?: string;
};

export type FollowUpActionResult = {
  ok: boolean;
  error?: string;
};

export type SchoolActionResult = {
  ok: boolean;
  error?: string;
};

export type ContactActionResult = {
  ok: boolean;
  error?: string;
};

const schoolStatusValues = [
  "Prospect",
  "Contacted",
  "Interviewing",
  "Partner"
] as const;

export type SchoolStatus = (typeof schoolStatusValues)[number];

const schoolStatusRank: Record<SchoolStatus, number> = {
  Prospect: 0,
  Contacted: 1,
  Interviewing: 2,
  Partner: 3
};

export function isValidSchoolStatusTransition(
  currentStatus: SchoolStatus,
  nextStatus: SchoolStatus
): boolean {
  if (currentStatus === nextStatus) {
    return true;
  }

  return schoolStatusRank[nextStatus] >= schoolStatusRank[currentStatus];
}

const sentimentValues = [
  "Strong fit",
  "Warm",
  "Needs nurturing",
  "Not a fit"
] as const;

const pilotInterestValues = ["High", "Medium", "Low", "None"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

const interviewNoteSchema = z
  .object({
    school_id: z.string().uuid({ message: "Select a valid school." }),
    interviewer: z
      .string()
      .trim()
      .min(1, "Interviewer is required.")
      .max(120, "Interviewer must be 120 characters or fewer."),
    interview_date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Interview date must use YYYY-MM-DD."),
    sentiment: z.enum(sentimentValues, {
      message: "Select a valid sentiment."
    }),
    raw_notes: optionalText(10000),
    pain_points: optionalText(5000),
    current_tools: optionalText(1000),
    buyer: optionalText(500),
    budget: optionalText(500),
    budget_owner: optionalText(500),
    objections: optionalText(2000),
    pilot_interest: z.enum(pilotInterestValues, {
      message: "Select a valid pilot readiness value."
    }),
    referrals: optionalText(1000),
    notes: optionalText(5000),
    next_step: z
      .string()
      .trim()
      .min(1, "Next action is required.")
      .max(500, "Next action must be 500 characters or fewer.")
  })
  .superRefine((data, context) => {
    if (!data.notes && !data.pain_points) {
      context.addIssue({
        code: "custom",
        message: "Interview summary or pain points is required.",
        path: ["notes"]
      });
    }
  });

export type InterviewNoteInput = z.infer<typeof interviewNoteSchema>;

const universityResearchInputSchema = z.object({
  school_name: z
    .string()
    .trim()
    .min(1, "Enter a school name to run the research agent.")
    .max(200, "School name must be 200 characters or fewer."),
  website: z
    .string()
    .trim()
    .max(500, "Website must be 500 characters or fewer.")
    .superRefine((value, context) => {
      if (!value) {
        return;
      }

      const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;

      try {
        const url = new URL(normalized);

        if (!["http:", "https:"].includes(url.protocol)) {
          context.addIssue({
            code: "custom",
            message: "Invalid website URL."
          });
        }
      } catch {
        context.addIssue({
          code: "custom",
          message: "Invalid website URL."
        });
      }
    })
});

export type UniversityResearchInput = z.infer<typeof universityResearchInputSchema>;

const outreachChannelValues = [
  "Email",
  "Call",
  "Meeting",
  "LinkedIn",
  "Event",
  "Other"
] as const;

const outreachLogSchema = z.object({
  school_id: z.string().uuid({ message: "Select a valid school." }),
  channel: z.enum(outreachChannelValues, {
    message: "Select a valid outreach channel."
  }),
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required.")
    .max(200, "Subject must be 200 characters or fewer."),
  outcome: z
    .string()
    .trim()
    .min(1, "Outcome is required.")
    .max(1000, "Outcome must be 1000 characters or fewer."),
  outreach_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Outreach date must use YYYY-MM-DD."),
  next_step: z
    .string()
    .trim()
    .min(1, "Next step is required.")
    .max(500, "Next step must be 500 characters or fewer.")
});

export type OutreachLogInput = z.infer<typeof outreachLogSchema>;

const createFollowUpSchema = z.object({
  school_id: z.string().uuid({ message: "Select a valid school." }),
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(200, "Title must be 200 characters or fewer."),
  due_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must use YYYY-MM-DD."),
  notes: optionalText(2000),
  owner: optionalText(120)
});

export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;

const completeFollowUpSchema = z.object({
  school_id: z.string().uuid({ message: "Select a valid school." }),
  follow_up_id: z.string().uuid({ message: "Select a valid follow-up." })
});

export type CompleteFollowUpInput = z.infer<typeof completeFollowUpSchema>;

function formatZodError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid input.";
}

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === null ? "" : String(value);
}

export function validateInterviewNote(
  formData: FormData
): ValidationResult<InterviewNoteInput> {
  const parsed = interviewNoteSchema.safeParse({
    school_id: formValue(formData, "school_id"),
    interviewer: formValue(formData, "interviewer"),
    interview_date: formValue(formData, "interview_date"),
    sentiment: formValue(formData, "sentiment"),
    raw_notes: formValue(formData, "raw_notes"),
    pain_points: formValue(formData, "pain_points"),
    current_tools: formValue(formData, "current_tools"),
    buyer: formValue(formData, "buyer"),
    budget: formValue(formData, "budget"),
    budget_owner: formValue(formData, "budget_owner"),
    objections: formValue(formData, "objections"),
    pilot_interest: formValue(formData, "pilot_interest"),
    referrals: formValue(formData, "referrals"),
    notes: formValue(formData, "notes"),
    next_step: formValue(formData, "next_step")
  });

  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error) };
  }

  return { success: true, data: parsed.data };
}

export function validateUniversityResearchInput(
  formData: FormData
): ValidationResult<UniversityResearchInput> {
  const parsed = universityResearchInputSchema.safeParse({
    school_name: formValue(formData, "school_name"),
    website: formValue(formData, "website")
  });

  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error) };
  }

  return { success: true, data: parsed.data };
}

export function validateOutreachLog(
  formData: FormData
): ValidationResult<OutreachLogInput> {
  const parsed = outreachLogSchema.safeParse({
    school_id: formValue(formData, "school_id"),
    channel: formValue(formData, "channel"),
    subject: formValue(formData, "subject"),
    outcome: formValue(formData, "outcome"),
    outreach_date: formValue(formData, "outreach_date"),
    next_step: formValue(formData, "next_step")
  });

  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error) };
  }

  return { success: true, data: parsed.data };
}

export function validateCreateFollowUp(
  formData: FormData
): ValidationResult<CreateFollowUpInput> {
  const parsed = createFollowUpSchema.safeParse({
    school_id: formValue(formData, "school_id"),
    title: formValue(formData, "title"),
    due_date: formValue(formData, "due_date"),
    notes: formValue(formData, "notes"),
    owner: formValue(formData, "owner")
  });

  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error) };
  }

  return { success: true, data: parsed.data };
}

export function validateCompleteFollowUp(
  formData: FormData
): ValidationResult<CompleteFollowUpInput> {
  const parsed = completeFollowUpSchema.safeParse({
    school_id: formValue(formData, "school_id"),
    follow_up_id: formValue(formData, "follow_up_id")
  });

  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error) };
  }

  return { success: true, data: parsed.data };
}

const optionalWebsiteSchema = z
  .string()
  .trim()
  .max(500, "Website must be 500 characters or fewer.")
  .superRefine((value, context) => {
    if (!value) {
      return;
    }

    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;

    try {
      const url = new URL(normalized);

      if (!["http:", "https:"].includes(url.protocol)) {
        context.addIssue({
          code: "custom",
          message: "Invalid website URL."
        });
      }
    } catch {
      context.addIssue({
        code: "custom",
        message: "Invalid website URL."
      });
    }
  })
  .optional()
  .transform((value) => value || undefined);

const schoolMutationFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "School name is required.")
    .max(200, "School name must be 200 characters or fewer."),
  website: optionalWebsiteSchema,
  status: z.enum(schoolStatusValues, {
    message: "Select a valid pipeline status."
  }),
  owner: z
    .string()
    .trim()
    .min(1, "Owner is required.")
    .max(120, "Owner must be 120 characters or fewer."),
  next_step: z
    .string()
    .trim()
    .min(1, "Next step is required.")
    .max(500, "Next step must be 500 characters or fewer."),
  notes: optionalText(5000),
  assigned_to: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .pipe(
      z
        .string()
        .uuid({ message: "Select a valid assignee." })
        .optional()
    ),
  assign_to_me: z.boolean()
});

const createSchoolSchema = schoolMutationFieldsSchema;

const updateSchoolSchema = schoolMutationFieldsSchema.extend({
  school_id: z.string().uuid({ message: "Select a valid school." })
});

export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>;

function parseSchoolMutationForm(formData: FormData) {
  return {
    name: formValue(formData, "name"),
    website: formValue(formData, "website"),
    status: formValue(formData, "status"),
    owner: formValue(formData, "owner"),
    next_step: formValue(formData, "next_step"),
    notes: formValue(formData, "notes"),
    assigned_to: formValue(formData, "assigned_to"),
    assign_to_me: formValue(formData, "assign_to_me") === "on"
  };
}

export function validateCreateSchool(
  formData: FormData
): ValidationResult<CreateSchoolInput> {
  return validateCreateSchoolInput(parseSchoolMutationForm(formData));
}

export function validateCreateSchoolInput(
  input: {
    name?: string;
    website?: string;
    status?: string;
    owner?: string;
    next_step?: string;
    notes?: string;
    assigned_to?: string;
    assign_to_me?: boolean;
  }
): ValidationResult<CreateSchoolInput> {
  const parsed = createSchoolSchema.safeParse({
    name: input.name ?? "",
    website: input.website ?? "",
    status: input.status || "Prospect",
    owner: input.owner ?? "",
    next_step: input.next_step ?? "",
    notes: input.notes ?? "",
    assigned_to: input.assigned_to ?? "",
    assign_to_me: input.assign_to_me ?? false
  });

  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error) };
  }

  return { success: true, data: parsed.data };
}

export function validateUpdateSchool(
  formData: FormData
): ValidationResult<UpdateSchoolInput> {
  const parsed = updateSchoolSchema.safeParse({
    school_id: formValue(formData, "school_id"),
    ...parseSchoolMutationForm(formData)
  });

  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error) };
  }

  return { success: true, data: parsed.data };
}

const contactRelationshipValues = [
  "New",
  "Warm",
  "Champion",
  "Needs follow-up"
] as const;

const contactFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(120, "Name must be 120 characters or fewer."),
  role: z
    .string()
    .trim()
    .min(1, "Role is required.")
    .max(120, "Role must be 120 characters or fewer."),
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address.")
    .max(254, "Email must be 254 characters or fewer."),
  phone: optionalText(40),
  notes: optionalText(2000),
  relationship: z.enum(contactRelationshipValues, {
    message: "Select a valid relationship status."
  })
});

const createContactSchema = contactFieldsSchema.extend({
  school_id: z.string().uuid({ message: "Select a valid school." })
});

const updateContactSchema = contactFieldsSchema.extend({
  school_id: z.string().uuid({ message: "Select a valid school." }),
  contact_id: z.string().uuid({ message: "Select a valid contact." })
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

function parseContactForm(formData: FormData) {
  return {
    name: formValue(formData, "name"),
    role: formValue(formData, "role"),
    email: formValue(formData, "email"),
    phone: formValue(formData, "phone"),
    notes: formValue(formData, "notes"),
    relationship: formValue(formData, "relationship")
  };
}

export function validateCreateContact(
  formData: FormData
): ValidationResult<CreateContactInput> {
  const parsed = createContactSchema.safeParse({
    school_id: formValue(formData, "school_id"),
    ...parseContactForm(formData)
  });

  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error) };
  }

  return { success: true, data: parsed.data };
}

export function validateUpdateContact(
  formData: FormData
): ValidationResult<UpdateContactInput> {
  const parsed = updateContactSchema.safeParse({
    school_id: formValue(formData, "school_id"),
    contact_id: formValue(formData, "contact_id"),
    ...parseContactForm(formData)
  });

  if (!parsed.success) {
    return { success: false, error: formatZodError(parsed.error) };
  }

  return { success: true, data: parsed.data };
}
