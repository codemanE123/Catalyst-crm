import { z } from "zod";

export const PROPOSAL_GENERATION_TARGET_TYPES = [
  "prospect_candidate",
  "school"
] as const;

export type ProposalGenerationTargetType =
  (typeof PROPOSAL_GENERATION_TARGET_TYPES)[number];

export const PROPOSAL_DRAFT_REVIEW_STATUSES = ["pending_review", "dismissed"] as const;

export type ProposalDraftReviewStatus =
  (typeof PROPOSAL_DRAFT_REVIEW_STATUSES)[number];

export const meetingPrepSummarySchema = z.object({
  meeting_objective: z.string().trim().max(600).nullable(),
  recommended_offering: z.string().trim().max(600).nullable(),
  next_step_recommendation: z.string().trim().max(600).nullable(),
  key_context: z.array(z.string().trim().max(400)).max(8),
  likely_priorities: z.array(z.string().trim().max(400)).max(6)
});

export const proposalGenerationPublicContextSchema = z.object({
  organization_name: z.string().trim().min(1).max(200),
  website: z.string().trim().max(500).nullable(),
  city: z.string().trim().max(120).nullable(),
  state: z.string().trim().max(32).nullable(),
  status: z.string().trim().max(40).nullable(),
  fit_score: z.number().min(0).max(1).nullable(),
  enrichment_summary: z.string().trim().max(1200).nullable(),
  outreach_angle: z.string().trim().max(600).nullable(),
  recommended_next_step: z.string().trim().max(600).nullable(),
  public_institutional_context: z.string().trim().max(800).nullable(),
  meeting_prep_summary: meetingPrepSummarySchema.nullable()
});

export const proposalDraftContentSchema = z.object({
  proposal_title: z.string().trim().min(10).max(200),
  executive_summary: z.string().trim().min(40).max(1200),
  proposed_program: z.string().trim().min(20).max(800),
  target_audience: z.string().trim().min(20).max(400),
  implementation_plan: z.array(z.string().trim().min(10).max(400)).min(2).max(8),
  timeline: z.string().trim().min(20).max(400),
  success_metrics: z.array(z.string().trim().min(10).max(300)).min(2).max(8),
  recommended_pricing_range: z.string().trim().min(10).max(200),
  next_steps: z.array(z.string().trim().min(10).max(400)).min(2).max(6),
  confidence_score: z.number().min(0).max(1)
});

export type ProposalGenerationPublicContext = z.infer<
  typeof proposalGenerationPublicContextSchema
>;
export type ProposalDraftContent = z.infer<typeof proposalDraftContentSchema>;

export type ProposalDraft = ProposalDraftContent & {
  id: string;
  organization_id: string;
  target_type: ProposalGenerationTargetType;
  target_id: string;
  prospect_candidate_id: string | null;
  school_id: string | null;
  review_status: ProposalDraftReviewStatus;
  created_at: string;
  updated_at: string;
};

export const PROPOSAL_DRAFT_REVIEW_WARNING =
  "Proposal drafts are internal only. Review and edit before sharing externally. Do not email or send proposals automatically.";
