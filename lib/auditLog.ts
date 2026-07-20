import type { SupabaseClient } from "@supabase/supabase-js";

export const AUDIT_ACTIONS = {
  interviewCreate: "interview.create",
  meetingImportReceived: "meeting_import.received",
  meetingImportAccepted: "meeting_import.accepted",
  meetingImportRejected: "meeting_import.rejected",
  meetingImportLinked: "meeting_import.linked",
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
  prospectWebDiscoveryQueued: "prospect.web_discovery_queued",
  prospectWebDiscoveryStarted: "prospect.web_discovery_started",
  prospectWebDiscoveryCompleted: "prospect.web_discovery_completed",
  prospectWebDiscoveryFailed: "prospect.web_discovery_failed",
  prospectWebSourceSkipped: "prospect.web_source_skipped",
  prospectWebDuplicateSkipped: "prospect.web_duplicate_skipped",
  prospectProviderNotConfigured: "prospect.provider_not_configured",
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
  agentEvaluationCreate: "agent.evaluation_create",
  agentEvaluationUpdate: "agent.evaluation_update",
  agentQualityCheckFailed: "agent.quality_check_failed",
  agentLowQualityFlagged: "agent.low_quality_flagged",
  promptVersionCreate: "prompt.version_create",
  promptVersionValidate: "prompt.version_validate",
  promptVersionActivate: "prompt.version_activate",
  promptVersionDeprecate: "prompt.version_deprecate",
  promptVersionArchive: "prompt.version_archive",
  promptVersionRollback: "prompt.version_rollback",
  rolloutCreate: "rollout.create",
  rolloutStart: "rollout.start",
  rolloutPause: "rollout.pause",
  rolloutResume: "rollout.resume",
  rolloutCancel: "rollout.cancel",
  rolloutPromote: "rollout.promote",
  rolloutRollback: "rollout.rollback",
  agentPolicyCreate: "agent_policy.create",
  agentPolicyUpdate: "agent_policy.update",
  agentPolicyValidate: "agent_policy.validate",
  agentPolicyActivate: "agent_policy.activate",
  agentPolicyDeprecate: "agent_policy.deprecate",
  agentPolicyArchive: "agent_policy.archive",
  agentPolicyRollback: "agent_policy.rollback",
  agentPolicyBreakGlassEnable: "agent_policy.break_glass_enable",
  agentPolicyBreakGlassExpire: "agent_policy.break_glass_expire",
  agentReadinessEvaluate: "agent_readiness.evaluate",
  agentReadinessCreate: "agent_readiness.create",
  agentReadinessSubmit: "agent_readiness.submit",
  agentReadinessApprove: "agent_readiness.approve",
  agentReadinessReject: "agent_readiness.reject",
  agentReadinessRevoke: "agent_readiness.revoke",
  agentReadinessExpire: "agent_readiness.expire",
  agentReadinessRenew: "agent_readiness.renew",
  agentReadinessExecutionDenied: "agent_readiness.execution_denied",
  agentPilotEnable: "agent_pilot.enable",
  agentPilotDisable: "agent_pilot.disable",
  agentPilotKillSwitchEnable: "agent_pilot.kill_switch_enable",
  agentPilotKillSwitchDisable: "agent_pilot.kill_switch_disable",
  agentPilotLimitsUpdate: "agent_pilot.limits_update",
  agentPilotOrgAllowlistEnable: "agent_pilot.org_allowlist_enable",
  agentPilotOrgAllowlistDisable: "agent_pilot.org_allowlist_disable",
  agentPilotUserAllowlistEnable: "agent_pilot.user_allowlist_enable",
  agentPilotUserAllowlistDisable: "agent_pilot.user_allowlist_disable",
  agentPilotAccessDenied: "agent_pilot.access_denied",
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
