"use server";

import { revalidatePath } from "next/cache";

import {
  approveProspectCandidate,
  rejectProspectCandidate
} from "@/lib/actions/prospectCandidates";
import { recordLightweightApprovalEvaluation } from "@/lib/actions/agentEvaluations";
import {
  runMeetingPrepForCandidate,
  runMeetingPrepForSchool
} from "@/lib/actions/meetingPrep";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import {
  canAccessApprovalOrganization,
  canActOnApprovals,
  canAssignApprovals,
  canViewApprovals,
  getAccessibleApprovalOrganizationIds,
  isUnsafeBulkApprovalAction
} from "@/lib/approvals/permissions";
import {
  isKnownApprovalPriority,
  isKnownApprovalSort,
  isKnownApprovalStatus,
  isKnownApprovalType,
  loadApprovalCenterDashboard
} from "@/lib/approvals/data";
import {
  parseApprovalItemId,
  type ApprovalPriority
} from "@/lib/approvals/types";
import {
  getMembershipsForUser,
  isSuperAdmin
} from "@/lib/authz";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

export type ApprovalActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export type ApprovalBulkItemResult = {
  id: string;
  ok: boolean;
  message: string;
};

const ARTIFACT_TABLE: Record<
  "contact_recommendation" | "meeting_prep" | "proposal_draft",
  string
> = {
  contact_recommendation: "prospect_contact_recommendations",
  meeting_prep: "meeting_prep_briefs",
  proposal_draft: "proposal_drafts"
};

async function requireApprovalsContext(options?: { mutate?: boolean; assign?: boolean }) {
  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    return {
      ok: false as const,
      error: isDevelopmentEnvironment()
        ? "Supabase is not configured."
        : SUPABASE_CONFIGURATION_ERROR
    };
  }

  const user = await requireUser();

  if (!user) {
    return { ok: false as const, error: "Sign in to view approvals." };
  }

  const memberships = await getMembershipsForUser(supabase, user.id);

  if (!canViewApprovals(memberships)) {
    return {
      ok: false as const,
      error: "You do not have permission to manage approval items."
    };
  }

  if (options?.mutate && !canActOnApprovals(memberships)) {
    return {
      ok: false as const,
      error: "You do not have permission to manage approval items."
    };
  }

  if (options?.assign && !canAssignApprovals(memberships)) {
    return {
      ok: false as const,
      error: "Only admins can assign approval reviewers."
    };
  }

  return {
    ok: true as const,
    supabase,
    user,
    memberships,
    accessibleOrganizationIds: getAccessibleApprovalOrganizationIds(memberships),
    canAct: canActOnApprovals(memberships),
    canAssign: canAssignApprovals(memberships),
    isSuperAdmin: isSuperAdmin(memberships)
  };
}

export async function loadApprovalsDashboard(input: {
  approvalType?: string | null;
  status?: string | null;
  priority?: string | null;
  assignedToMe?: boolean;
  organizationId?: string | null;
  createdFrom?: string | null;
  createdTo?: string | null;
  confidenceMin?: string | null;
  confidenceMax?: string | null;
  targetQuery?: string | null;
  staleDaysMin?: string | null;
  sort?: string | null;
  page?: number;
}) {
  const context = await requireApprovalsContext();

  if (!context.ok) {
    return { ok: false as const, error: context.error };
  }

  const organizationId = input.organizationId?.trim() || null;

  if (
    organizationId &&
    !canAccessApprovalOrganization(context.memberships, organizationId)
  ) {
    return { ok: false as const, error: "Organization is outside your access scope." };
  }

  const page = Math.max(1, input.page ?? 1);
  const pageSize = 25;
  const staleRaw = input.staleDaysMin?.trim();
  const staleDaysMin = staleRaw ? Number.parseInt(staleRaw, 10) : null;
  const confidenceMin = input.confidenceMin
    ? Number.parseFloat(input.confidenceMin)
    : null;
  const confidenceMax = input.confidenceMax
    ? Number.parseFloat(input.confidenceMax)
    : null;

  const dashboard = await loadApprovalCenterDashboard(
    context.supabase,
    {
      organizationIds: context.accessibleOrganizationIds,
      organizationId,
      approvalType:
        input.approvalType && isKnownApprovalType(input.approvalType)
          ? input.approvalType
          : null,
      status:
        input.status === ""
          ? null
          : input.status && isKnownApprovalStatus(input.status)
            ? input.status
            : "pending",
      priority:
        input.priority && isKnownApprovalPriority(input.priority)
          ? input.priority
          : null,
      assignedToMe: Boolean(input.assignedToMe),
      currentUserId: context.user.id,
      createdFrom: input.createdFrom?.trim() || null,
      createdTo: input.createdTo?.trim()
        ? `${input.createdTo.trim()}T23:59:59.999Z`
        : null,
      confidenceMin: Number.isFinite(confidenceMin) ? confidenceMin : null,
      confidenceMax: Number.isFinite(confidenceMax) ? confidenceMax : null,
      targetQuery: input.targetQuery?.trim() || null,
      staleDaysMin:
        staleDaysMin != null && Number.isFinite(staleDaysMin) ? staleDaysMin : null,
      sort:
        input.sort && isKnownApprovalSort(input.sort) ? input.sort : "default",
      limit: pageSize,
      offset: (page - 1) * pageSize
    },
    context.user.id
  );

  return {
    ok: true as const,
    ...dashboard,
    canAct: context.canAct,
    canAssign: context.canAssign,
    isSuperAdmin: context.isSuperAdmin,
    currentUserId: context.user.id
  };
}

async function assertSourceOrg(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>,
  memberships: Awaited<ReturnType<typeof getMembershipsForUser>>,
  table: string,
  sourceId: string
): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from(table)
    .select("id,organization_id")
    .eq("id", sourceId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "Approval item was not found in your organization." };
  }

  const organizationId = String(
    (data as { organization_id: string }).organization_id
  );

  if (!canAccessApprovalOrganization(memberships, organizationId)) {
    return { ok: false, error: "Organization is outside your access scope." };
  }

  return { ok: true, organizationId };
}

export async function approveApprovalItem(input: {
  approvalItemId: string;
  usefulnessScore?: number | null;
  feedback?: string | null;
  approvedWithEdits?: boolean;
}): Promise<ApprovalActionResult> {
  const context = await requireApprovalsContext({ mutate: true });
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const parsed = parseApprovalItemId(input.approvalItemId);
  if (!parsed) {
    return { ok: false, error: "Invalid approval item." };
  }

  const evaluationOutcome = input.approvedWithEdits
    ? "approved_with_edits"
    : "accepted";

  async function recordEval(organizationId: string, agentName?: string | null) {
    await recordLightweightApprovalEvaluation({
      organizationId,
      approvalType: parsed!.approvalType,
      sourceId: parsed!.sourceId,
      outcome: evaluationOutcome,
      agentName: agentName ?? null,
      targetType: parsed!.approvalType,
      targetId: parsed!.sourceId,
      usefulnessScore: input.usefulnessScore ?? null,
      feedback: input.feedback ?? null
    });
  }

  if (
    parsed.approvalType === "prospect_candidate" ||
    parsed.approvalType === "prospect_enrichment" ||
    parsed.approvalType === "outreach_draft"
  ) {
    const ownership = await assertSourceOrg(
      context.supabase,
      context.memberships,
      "prospect_candidates",
      parsed.sourceId
    );
    if (!ownership.ok) {
      return ownership;
    }

    const { data: candidate } = await context.supabase
      .from("prospect_candidates")
      .select("id,job_id")
      .eq("id", parsed.sourceId)
      .maybeSingle();

    if (!candidate) {
      return { ok: false, error: "Prospect candidate was not found." };
    }

    const formData = new FormData();
    formData.set("candidate_id", parsed.sourceId);
    formData.set("job_id", String((candidate as { job_id: string }).job_id));

    const result = await approveProspectCandidate(formData);

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    await recordAuditEvent(context.supabase, {
      organizationId: ownership.organizationId,
      actorUserId: context.user.id,
      action: AUDIT_ACTIONS.approvalApprove,
      targetTable: "prospect_candidates",
      recordId: parsed.sourceId,
      metadata: {
        approval_type: parsed.approvalType,
        reused_action: "approveProspectCandidate"
      }
    });

    await recordEval(ownership.organizationId, "ProspectGenerationAgent");

    revalidatePath("/approvals");
    return { ok: true, message: "Prospect candidate approved." };
  }

  if (
    parsed.approvalType === "contact_recommendation" ||
    parsed.approvalType === "meeting_prep" ||
    parsed.approvalType === "proposal_draft"
  ) {
    const table = ARTIFACT_TABLE[parsed.approvalType];
    const ownership = await assertSourceOrg(
      context.supabase,
      context.memberships,
      table,
      parsed.sourceId
    );
    if (!ownership.ok) {
      return ownership;
    }

    const { error } = await context.supabase
      .from(table)
      .update({ review_status: "accepted" })
      .eq("id", parsed.sourceId)
      .eq("organization_id", ownership.organizationId);

    if (error) {
      return { ok: false, error: "Could not accept this approval item." };
    }

    await recordAuditEvent(context.supabase, {
      organizationId: ownership.organizationId,
      actorUserId: context.user.id,
      action: AUDIT_ACTIONS.approvalApprove,
      targetTable: table,
      recordId: parsed.sourceId,
      metadata: { approval_type: parsed.approvalType }
    });

    const agentName =
      parsed.approvalType === "contact_recommendation"
        ? "ContactDiscoveryAgent"
        : parsed.approvalType === "meeting_prep"
          ? "MeetingPrepAgent"
          : "ProposalGenerationAgent";
    await recordEval(ownership.organizationId, agentName);

    revalidatePath("/approvals");
    return { ok: true, message: "Item accepted for human-reviewed use." };
  }

  return { ok: false, error: "Unsupported approval type." };
}

export async function rejectApprovalItem(input: {
  approvalItemId: string;
  feedback?: string | null;
}): Promise<ApprovalActionResult> {
  const context = await requireApprovalsContext({ mutate: true });
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const parsed = parseApprovalItemId(input.approvalItemId);
  if (!parsed) {
    return { ok: false, error: "Invalid approval item." };
  }

  if (
    parsed.approvalType === "prospect_candidate" ||
    parsed.approvalType === "prospect_enrichment" ||
    parsed.approvalType === "outreach_draft"
  ) {
    const ownership = await assertSourceOrg(
      context.supabase,
      context.memberships,
      "prospect_candidates",
      parsed.sourceId
    );
    if (!ownership.ok) {
      return ownership;
    }

    const { data: candidate } = await context.supabase
      .from("prospect_candidates")
      .select("id,job_id")
      .eq("id", parsed.sourceId)
      .maybeSingle();

    if (!candidate) {
      return { ok: false, error: "Prospect candidate was not found." };
    }

    const formData = new FormData();
    formData.set("candidate_id", parsed.sourceId);
    formData.set("job_id", String((candidate as { job_id: string }).job_id));

    const result = await rejectProspectCandidate(formData);

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    await recordAuditEvent(context.supabase, {
      organizationId: ownership.organizationId,
      actorUserId: context.user.id,
      action: AUDIT_ACTIONS.approvalReject,
      targetTable: "prospect_candidates",
      recordId: parsed.sourceId,
      metadata: {
        approval_type: parsed.approvalType,
        reused_action: "rejectProspectCandidate"
      }
    });

    await recordLightweightApprovalEvaluation({
      organizationId: ownership.organizationId,
      approvalType: parsed.approvalType,
      sourceId: parsed.sourceId,
      outcome: "rejected",
      agentName: "ProspectGenerationAgent",
      targetId: parsed.sourceId,
      feedback: input.feedback ?? null
    });

    revalidatePath("/approvals");
    return { ok: true, message: "Prospect candidate rejected." };
  }

  if (
    parsed.approvalType === "contact_recommendation" ||
    parsed.approvalType === "meeting_prep" ||
    parsed.approvalType === "proposal_draft"
  ) {
    const table = ARTIFACT_TABLE[parsed.approvalType];
    const ownership = await assertSourceOrg(
      context.supabase,
      context.memberships,
      table,
      parsed.sourceId
    );
    if (!ownership.ok) {
      return ownership;
    }

    const { error } = await context.supabase
      .from(table)
      .update({ review_status: "dismissed" })
      .eq("id", parsed.sourceId)
      .eq("organization_id", ownership.organizationId);

    if (error) {
      return { ok: false, error: "Could not reject this approval item." };
    }

    await recordAuditEvent(context.supabase, {
      organizationId: ownership.organizationId,
      actorUserId: context.user.id,
      action: AUDIT_ACTIONS.approvalReject,
      targetTable: table,
      recordId: parsed.sourceId,
      metadata: { approval_type: parsed.approvalType }
    });

    await recordLightweightApprovalEvaluation({
      organizationId: ownership.organizationId,
      approvalType: parsed.approvalType,
      sourceId: parsed.sourceId,
      outcome: "rejected",
      targetId: parsed.sourceId,
      feedback: input.feedback ?? null
    });

    revalidatePath("/approvals");
    return { ok: true, message: "Item dismissed." };
  }

  return { ok: false, error: "Unsupported approval type." };
}

export async function markApprovalNeedsRevision(input: {
  approvalItemId: string;
  feedback?: string | null;
}): Promise<ApprovalActionResult> {
  const context = await requireApprovalsContext({ mutate: true });
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const parsed = parseApprovalItemId(input.approvalItemId);
  if (!parsed) {
    return { ok: false, error: "Invalid approval item." };
  }

  if (
    parsed.approvalType === "prospect_candidate" ||
    parsed.approvalType === "prospect_enrichment" ||
    parsed.approvalType === "outreach_draft"
  ) {
    return {
      ok: false,
      error: "Use the full prospect review page to request candidate revisions."
    };
  }

  if (
    parsed.approvalType !== "contact_recommendation" &&
    parsed.approvalType !== "meeting_prep" &&
    parsed.approvalType !== "proposal_draft"
  ) {
    return { ok: false, error: "Unsupported approval type." };
  }

  const table = ARTIFACT_TABLE[parsed.approvalType];
  const ownership = await assertSourceOrg(
    context.supabase,
    context.memberships,
    table,
    parsed.sourceId
  );
  if (!ownership.ok) {
    return ownership;
  }

  const { error } = await context.supabase
    .from(table)
    .update({ review_status: "needs_revision" })
    .eq("id", parsed.sourceId)
    .eq("organization_id", ownership.organizationId);

  if (error) {
    return { ok: false, error: "Could not mark this item as needs revision." };
  }

  await recordAuditEvent(context.supabase, {
    organizationId: ownership.organizationId,
    actorUserId: context.user.id,
    action: AUDIT_ACTIONS.approvalNeedsRevision,
    targetTable: table,
    recordId: parsed.sourceId,
    metadata: { approval_type: parsed.approvalType }
  });

  await recordLightweightApprovalEvaluation({
    organizationId: ownership.organizationId,
    approvalType: parsed.approvalType,
    sourceId: parsed.sourceId,
    outcome: "needs_revision",
    targetId: parsed.sourceId,
    feedback: input.feedback ?? null
  });

  revalidatePath("/approvals");
  return { ok: true, message: "Marked as needs revision." };
}

export async function refreshMeetingPrepApproval(input: {
  approvalItemId: string;
}): Promise<ApprovalActionResult> {
  const context = await requireApprovalsContext({ mutate: true });
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const parsed = parseApprovalItemId(input.approvalItemId);
  if (!parsed || parsed.approvalType !== "meeting_prep") {
    return { ok: false, error: "Only meeting prep items can be refreshed." };
  }

  const ownership = await assertSourceOrg(
    context.supabase,
    context.memberships,
    "meeting_prep_briefs",
    parsed.sourceId
  );
  if (!ownership.ok) {
    return ownership;
  }

  const { data } = await context.supabase
    .from("meeting_prep_briefs")
    .select("target_type,target_id")
    .eq("id", parsed.sourceId)
    .maybeSingle();

  if (!data) {
    return { ok: false, error: "Meeting prep brief was not found." };
  }

  const targetType = String((data as { target_type: string }).target_type);
  const targetId = String((data as { target_id: string }).target_id);

  const result =
    targetType === "school"
      ? await runMeetingPrepForSchool(targetId)
      : await runMeetingPrepForCandidate(targetId);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/approvals");
  return { ok: true, message: "Meeting prep refresh started." };
}

export async function assignApprovalReviewer(input: {
  approvalItemId: string;
  assignedTo: string;
  priority?: ApprovalPriority | null;
}): Promise<ApprovalActionResult> {
  const context = await requireApprovalsContext({ assign: true });
  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const parsed = parseApprovalItemId(input.approvalItemId);
  if (!parsed) {
    return { ok: false, error: "Invalid approval item." };
  }

  const table =
    parsed.approvalType === "contact_recommendation" ||
    parsed.approvalType === "meeting_prep" ||
    parsed.approvalType === "proposal_draft"
      ? ARTIFACT_TABLE[parsed.approvalType]
      : "prospect_candidates";

  const ownership = await assertSourceOrg(
    context.supabase,
    context.memberships,
    table,
    parsed.sourceId
  );
  if (!ownership.ok) {
    return ownership;
  }

  const { error } = await context.supabase.from("approval_assignments").upsert(
    {
      organization_id: ownership.organizationId,
      approval_type: parsed.approvalType,
      source_id: parsed.sourceId,
      assigned_to: input.assignedTo,
      assigned_by: context.user.id,
      priority: input.priority ?? null
    },
    { onConflict: "approval_type,source_id" }
  );

  if (error) {
    return { ok: false, error: "Could not assign reviewer." };
  }

  await recordAuditEvent(context.supabase, {
    organizationId: ownership.organizationId,
    actorUserId: context.user.id,
    action: AUDIT_ACTIONS.approvalAssign,
    targetTable: "approval_assignments",
    recordId: parsed.sourceId,
    metadata: {
      approval_type: parsed.approvalType,
      assigned_to: input.assignedTo,
      priority: input.priority ?? null
    }
  });

  revalidatePath("/approvals");
  return { ok: true, message: "Reviewer assigned." };
}

export async function bulkApprovalSafeAction(input: {
  approvalItemIds: string[];
  action: "assign" | "set_priority" | "needs_revision";
  assignedTo?: string;
  priority?: ApprovalPriority;
}): Promise<{ ok: true; results: ApprovalBulkItemResult[] } | { ok: false; error: string }> {
  if (isUnsafeBulkApprovalAction(input.action === "needs_revision" ? "needs_revision" : input.action)) {
    // never true for allowlisted actions; guard against future misuse
  }

  if (
    input.action !== "assign" &&
    input.action !== "set_priority" &&
    input.action !== "needs_revision"
  ) {
    return {
      ok: false,
      error: "Bulk approve, reject, send, and contact creation are not allowed."
    };
  }

  const context = await requireApprovalsContext({
    mutate: input.action === "needs_revision",
    assign: input.action === "assign" || input.action === "set_priority"
  });

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const results: ApprovalBulkItemResult[] = [];

  for (const approvalItemId of input.approvalItemIds.slice(0, 25)) {
    if (input.action === "needs_revision") {
      const result = await markApprovalNeedsRevision({ approvalItemId });
      results.push({
        id: approvalItemId,
        ok: result.ok,
        message: result.ok ? result.message : result.error
      });
      continue;
    }

    if (input.action === "assign") {
      if (!input.assignedTo) {
        results.push({
          id: approvalItemId,
          ok: false,
          message: "Assignee is required."
        });
        continue;
      }

      const result = await assignApprovalReviewer({
        approvalItemId,
        assignedTo: input.assignedTo,
        priority: input.priority ?? null
      });
      results.push({
        id: approvalItemId,
        ok: result.ok,
        message: result.ok ? result.message : result.error
      });
      continue;
    }

    // set_priority
    if (!input.priority) {
      results.push({
        id: approvalItemId,
        ok: false,
        message: "Priority is required."
      });
      continue;
    }

    const parsed = parseApprovalItemId(approvalItemId);
    if (!parsed) {
      results.push({ id: approvalItemId, ok: false, message: "Invalid item." });
      continue;
    }

    const table =
      parsed.approvalType === "contact_recommendation" ||
      parsed.approvalType === "meeting_prep" ||
      parsed.approvalType === "proposal_draft"
        ? ARTIFACT_TABLE[parsed.approvalType]
        : "prospect_candidates";

    const ownership = await assertSourceOrg(
      context.supabase,
      context.memberships,
      table,
      parsed.sourceId
    );

    if (!ownership.ok) {
      results.push({ id: approvalItemId, ok: false, message: ownership.error });
      continue;
    }

    const { error } = await context.supabase.from("approval_assignments").upsert(
      {
        organization_id: ownership.organizationId,
        approval_type: parsed.approvalType,
        source_id: parsed.sourceId,
        assigned_to: context.user.id,
        assigned_by: context.user.id,
        priority: input.priority
      },
      { onConflict: "approval_type,source_id" }
    );

    results.push({
      id: approvalItemId,
      ok: !error,
      message: error ? "Could not update priority." : "Priority updated."
    });
  }

  await recordAuditEvent(context.supabase, {
    organizationId: null,
    actorUserId: context.user.id,
    action: AUDIT_ACTIONS.approvalBulkAction,
    targetTable: "approval_assignments",
    metadata: {
      action: input.action,
      item_count: results.length,
      success_count: results.filter((row) => row.ok).length
    }
  });

  revalidatePath("/approvals");
  return { ok: true, results };
}

export async function countPendingApprovalsForNav(): Promise<number> {
  const context = await requireApprovalsContext();
  if (!context.ok) {
    return 0;
  }

  const { countAwaitingHumanReview } = await import("@/lib/approvals/data");
  return countAwaitingHumanReview(
    context.supabase,
    context.accessibleOrganizationIds
  );
}
