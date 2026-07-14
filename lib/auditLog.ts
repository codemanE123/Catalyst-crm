import type { SupabaseClient } from "@supabase/supabase-js";

export const AUDIT_ACTIONS = {
  interviewCreate: "interview.create",
  outreachCreate: "outreach.create",
  followUpCreate: "follow_up.create",
  followUpComplete: "follow_up.complete",
  schoolCreate: "school.create",
  schoolImport: "school.import",
  schoolUpdate: "school.update",
  contactCreate: "contact.create",
  contactUpdate: "contact.update",
  prospectJobCreate: "prospect.job_create",
  prospectJobRun: "prospect.job_run",
  prospectJobComplete: "prospect.job_complete",
  prospectJobFail: "prospect.job_fail",
  prospectCandidateApprove: "prospect_candidate.approve",
  prospectCandidateReject: "prospect_candidate.reject",
  prospectCandidateEnrich: "prospect_candidate.enrich",
  prospectCandidateOutreachDraft: "prospect_candidate.outreach_draft",
  prospectCandidateOutreachDraftSave: "prospect_candidate.outreach_draft_save",
  agentQueue: "agent.queue",
  agentStart: "agent.start",
  agentComplete: "agent.complete",
  agentFail: "agent.fail",
  agentRetry: "agent.retry",
  agentCancel: "agent.cancel",
  agentRetryScheduled: "agent.retry_scheduled",
  agentRetryExhausted: "agent.retry_exhausted",
  agentStaleRecovered: "agent.stale_recovered",
  agentPolicyDenied: "agent.policy_denied",
  agentUsageLimitReached: "agent.usage_limit_reached",
  agentBudgetLimitReached: "agent.budget_limit_reached",
  agentChainDepthExceeded: "agent.chain_depth_exceeded",
  approvalView: "approval.view",
  approvalAssign: "approval.assign",
  approvalApprove: "approval.approve",
  approvalReject: "approval.reject",
  approvalNeedsRevision: "approval.needs_revision",
  approvalBulkAction: "approval.bulk_action",
  contactDiscoveryRun: "contact_discovery.run",
  contactDiscoveryComplete: "contact_discovery.complete",
  contactDiscoveryFail: "contact_discovery.fail",
  meetingPrepRun: "meeting_prep.run",
  meetingPrepComplete: "meeting_prep.complete",
  meetingPrepFail: "meeting_prep.fail",
  proposalDraftRun: "proposal_draft.run",
  proposalDraftComplete: "proposal_draft.complete",
  proposalDraftFail: "proposal_draft.fail",
  universityResearchRun: "university_research.run",
  universityResearchSave: "university_research.save",
  membershipRoleChange: "membership.role_change",
  membershipRemove: "membership.remove"
} as const;

export type AuditMetadata = Record<string, string | number | boolean | null>;

export type AuditEventInput = {
  organizationId: string | null;
  actorUserId: string;
  action: string;
  targetTable: string;
  recordId?: string | null;
  metadata?: AuditMetadata;
};

export async function recordAuditEvent(
  supabase: SupabaseClient,
  event: AuditEventInput
) {
  const { error } = await supabase.from("audit_events").insert({
    organization_id: event.organizationId,
    actor_user_id: event.actorUserId,
    action: event.action,
    target_table: event.targetTable,
    record_id: event.recordId ?? null,
    metadata: event.metadata ?? {}
  });

  if (error) {
    console.error("Failed to record audit event:", error.message);
  }
}
