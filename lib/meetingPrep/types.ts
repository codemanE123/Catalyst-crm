import { z } from "zod";

export const MEETING_PREP_TARGET_TYPES = ["prospect_candidate", "school"] as const;

export type MeetingPrepTargetType = (typeof MEETING_PREP_TARGET_TYPES)[number];

export const MEETING_PREP_REVIEW_STATUSES = ["pending_review", "dismissed"] as const;

export type MeetingPrepReviewStatus = (typeof MEETING_PREP_REVIEW_STATUSES)[number];

export const outreachSummarySchema = z.object({
  channel: z.string().trim().min(1).max(40),
  subject: z.string().trim().max(200).nullable(),
  outcome: z.string().trim().max(200).nullable(),
  outreach_date: z.string().trim().min(1).max(32)
});

export const followUpSummarySchema = z.object({
  title: z.string().trim().min(1).max(200),
  status: z.string().trim().min(1).max(40),
  due_date: z.string().trim().max(32).nullable()
});

export const interviewSummarySchema = z.object({
  sentiment: z.string().trim().min(1).max(80),
  pain_points: z.string().trim().max(400).nullable(),
  buyer: z.string().trim().max(200).nullable(),
  pilot_interest: z.string().trim().max(40).nullable(),
  next_step: z.string().trim().max(400).nullable(),
  objections: z.string().trim().max(400).nullable(),
  budget: z.string().trim().max(200).nullable()
});

export const meetingPrepPublicContextSchema = z.object({
  organization_name: z.string().trim().min(1).max(200),
  website: z.string().trim().max(500).nullable(),
  city: z.string().trim().max(120).nullable(),
  state: z.string().trim().max(32).nullable(),
  status: z.string().trim().max(40).nullable(),
  fit_score: z.number().min(0).max(1).nullable(),
  confidence_score: z.number().min(0).max(1).nullable(),
  enrichment_summary: z.string().trim().max(1200).nullable(),
  outreach_angle: z.string().trim().max(600).nullable(),
  recommended_next_step: z.string().trim().max(600).nullable(),
  contact_role_titles: z.array(z.string().trim().min(1).max(200)).max(12),
  outreach_summaries: z.array(outreachSummarySchema).max(8),
  follow_up_summaries: z.array(followUpSummarySchema).max(8),
  interview_summaries: z.array(interviewSummarySchema).max(6),
  cyber_programs: z.string().trim().max(400).nullable(),
  workforce_signals: z.string().trim().max(400).nullable()
});

export const meetingPrepBriefSchema = z.object({
  meeting_objective: z.string().trim().min(20).max(600),
  key_context: z.array(z.string().trim().min(10).max(400)).min(1).max(8),
  likely_priorities: z.array(z.string().trim().min(10).max(400)).min(1).max(6),
  suggested_questions: z.array(z.string().trim().min(10).max(400)).min(3).max(8),
  recommended_securecell_offering: z.string().trim().min(20).max(600),
  objections_to_prepare_for: z.array(z.string().trim().min(10).max(400)).min(1).max(6),
  next_step_recommendation: z.string().trim().min(20).max(600),
  confidence_score: z.number().min(0).max(1)
});

export type MeetingPrepPublicContext = z.infer<typeof meetingPrepPublicContextSchema>;
export type MeetingPrepBriefContent = z.infer<typeof meetingPrepBriefSchema>;

export type MeetingPrepBrief = MeetingPrepBriefContent & {
  id: string;
  organization_id: string;
  target_type: MeetingPrepTargetType;
  target_id: string;
  prospect_candidate_id: string | null;
  school_id: string | null;
  review_status: MeetingPrepReviewStatus;
  created_at: string;
  updated_at: string;
};

export const MEETING_PREP_REVIEW_WARNING =
  "Meeting prep briefs are internal drafts for human review only. Verify details before meetings. Do not send externally or auto-schedule meetings.";
