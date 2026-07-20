import { z } from "zod";

import { flagsPossibleStudentPii } from "./normalizeFireflies";

export const MEETING_PARSE_PROMPT_VERSION = "meeting.parse.v1";

const sentimentValues = [
  "Strong fit",
  "Warm",
  "Needs nurturing",
  "Not a fit"
] as const;

const pilotValues = ["High", "Medium", "Low", "None"] as const;

export const meetingParseAttendeeSchema = z.object({
  name: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().max(254).nullable().optional(),
  title: z.string().trim().max(120).nullable().optional()
});

export const meetingParseContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().max(254).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  linkedin: z.string().trim().max(500).nullable().optional()
});

export const meetingParseActionItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  owner: z.string().trim().max(120).nullable().optional(),
  due_date: z.string().trim().max(32).nullable().optional()
});

export const meetingParseOutputSchema = z.object({
  meeting_title: z.string().trim().max(500).nullable().optional(),
  meeting_date: z.string().trim().max(32).nullable().optional(),
  summary: z.string().trim().max(2000).nullable().optional(),
  attendees: z.array(meetingParseAttendeeSchema).max(25).optional().default([]),
  institution_name: z.string().trim().max(200).nullable().optional(),
  affiliation: z
    .enum(["school", "partner", "unknown"])
    .optional()
    .default("unknown"),
  contacts: z.array(meetingParseContactSchema).max(10).optional().default([]),
  discovery: z
    .object({
      pain_points: z.string().trim().max(2000).nullable().optional(),
      current_tools: z.string().trim().max(1000).nullable().optional(),
      buyer: z.string().trim().max(200).nullable().optional(),
      budget: z.string().trim().max(200).nullable().optional(),
      budget_owner: z.string().trim().max(200).nullable().optional(),
      objections: z.string().trim().max(2000).nullable().optional(),
      pilot_interest: z.enum(pilotValues).nullable().optional(),
      referrals: z.string().trim().max(1000).nullable().optional(),
      next_step: z.string().trim().max(500).nullable().optional(),
      sentiment: z.enum(sentimentValues).nullable().optional()
    })
    .optional()
    .default({}),
  action_items: z.array(meetingParseActionItemSchema).max(10).optional().default([]),
  outreach: z
    .object({
      subject: z.string().trim().max(200).nullable().optional(),
      outcome: z.string().trim().max(200).nullable().optional()
    })
    .optional()
    .default({}),
  quotes: z.array(z.string().trim().min(1).max(400)).max(8).optional().default([]),
  risks: z.array(z.string().trim().min(1).max(300)).max(8).optional().default([]),
  possible_student_pii: z.boolean().optional().default(false)
});

export type MeetingParseOutput = z.infer<typeof meetingParseOutputSchema>;

function cleanEmail(value: string): string | null {
  const match = value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function extractEmails(text: string): string[] {
  const found = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
  return [...new Set(found.map((email) => email.toLowerCase()))].slice(0, 15);
}

function extractSection(text: string, labels: RegExp[]): string | null {
  for (const label of labels) {
    const match = text.match(label);
    if (!match || match.index == null) {
      continue;
    }
    const after = text.slice(match.index + match[0].length).trim();
    const nextHeading = after.search(/\n\s*[A-Z][A-Za-z /-]{2,40}:\s*\n/);
    const body = (nextHeading >= 0 ? after.slice(0, nextHeading) : after)
      .trim()
      .slice(0, 1500);
    if (body) {
      return body;
    }
  }
  return null;
}

function inferSentiment(
  text: string
): MeetingParseOutput["discovery"]["sentiment"] {
  const lower = text.toLowerCase();
  if (/\b(not a fit|no fit|pass on this)\b/.test(lower)) {
    return "Not a fit";
  }
  if (/\b(strong fit|very interested|excited to move)\b/.test(lower)) {
    return "Strong fit";
  }
  if (/\b(needs nurturing|follow[- ]?up needed|lukewarm)\b/.test(lower)) {
    return "Needs nurturing";
  }
  if (/\b(warm|positive|good conversation)\b/.test(lower)) {
    return "Warm";
  }
  return "Warm";
}

function inferPilotInterest(
  text: string
): MeetingParseOutput["discovery"]["pilot_interest"] {
  const lower = text.toLowerCase();
  if (/\bpilot interest[:\s]+high\b|\bhigh interest in (a )?pilot\b/.test(lower)) {
    return "High";
  }
  if (/\bpilot interest[:\s]+low\b|\blow interest\b/.test(lower)) {
    return "Low";
  }
  if (/\bno pilot\b|\bnot interested in a pilot\b/.test(lower)) {
    return "None";
  }
  if (/\bpilot\b/.test(lower)) {
    return "Medium";
  }
  return null;
}

function extractActionItems(text: string): MeetingParseOutput["action_items"] {
  const section =
    extractSection(text, [
      /action items?:/i,
      /next steps?:/i,
      /follow[- ]?ups?:/i
    ]) ?? "";
  const source = section || text;
  const lines = source
    .split(/\n|•|;/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((line) => line.length >= 8 && line.length <= 200)
    .slice(0, 8);

  return lines.map((title) => ({ title, owner: null, due_date: null }));
}

/**
 * Deterministic local parse when LLM is unavailable.
 */
export function parseMeetingDigestHeuristic(params: {
  digestText: string | null;
  transcriptExcerpt?: string | null;
  meetingTitle?: string | null;
  meetingStartedAt?: string | null;
}): MeetingParseOutput {
  const text = [params.digestText, params.transcriptExcerpt]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const emails = extractEmails(text);
  const attendees = emails.map((email) => ({
    name: null,
    email,
    title: null
  }));

  const summary =
    text.slice(0, 800).trim() ||
    params.meetingTitle?.trim() ||
    "Meeting digest";

  const nextStep =
    extractSection(text, [/next steps?:/i, /follow[- ]?up:/i])?.split(/\n/)[0] ??
    null;

  const painPoints = extractSection(text, [
    /pain points?:/i,
    /challenges?:/i,
    /problems?:/i
  ]);
  const objections = extractSection(text, [/objections?:/i, /concerns?:/i]);
  const tools = extractSection(text, [
    /current tools?:/i,
    /tools?:/i,
    /stack:/i
  ]);
  const budget = extractSection(text, [/budget:/i]);

  const draft = {
    meeting_title: params.meetingTitle?.trim() || null,
    meeting_date: params.meetingStartedAt?.slice(0, 10) || null,
    summary,
    attendees,
    institution_name: null,
    affiliation: "unknown" as const,
    contacts: emails.slice(0, 5).map((email) => ({
      name: email.split("@")[0]?.replace(/[._]/g, " ") || "Contact",
      role: null,
      email,
      phone: null,
      linkedin: null
    })),
    discovery: {
      pain_points: painPoints,
      current_tools: tools,
      buyer: null,
      budget,
      budget_owner: null,
      objections,
      pilot_interest: inferPilotInterest(text),
      referrals: null,
      next_step: nextStep,
      sentiment: inferSentiment(text)
    },
    action_items: extractActionItems(text),
    outreach: {
      subject: params.meetingTitle?.trim() || "Meeting",
      outcome: "Completed"
    },
    quotes: [],
    risks: [],
    possible_student_pii: flagsPossibleStudentPii(text)
  };

  return meetingParseOutputSchema.parse(draft);
}

export function validateMeetingParseOutput(
  value: unknown
):
  | { success: true; data: MeetingParseOutput }
  | { success: false; error: string } {
  const parsed = meetingParseOutputSchema.safeParse(value);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid parse output."
    };
  }

  // Normalize empty emails to null
  const data = {
    ...parsed.data,
    attendees: parsed.data.attendees.map((row) => ({
      ...row,
      email: row.email ? cleanEmail(row.email) : null
    })),
    contacts: parsed.data.contacts.map((row) => ({
      ...row,
      email: row.email ? cleanEmail(row.email) : null
    }))
  };

  return { success: true, data };
}
