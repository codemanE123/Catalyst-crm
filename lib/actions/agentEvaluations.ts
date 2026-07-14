"use server";

import { revalidatePath } from "next/cache";

import {
  FEEDBACK_CATEGORIES,
  AGENT_EVALUATION_OUTCOMES,
  buildQualityResult,
  collectLowQualityFlags,
  isValidQualityScore,
  runAutomatedQualityChecks,
  scrubEvaluationFeedback,
  SupabaseAgentEvaluationStore,
  type AgentEvaluation,
  type AgentEvaluationMetadata,
  type AgentEvaluationOutcome,
  type FeedbackCategory,
  type QualityDimensionScores
} from "@/lib/agents/evaluation";
import { canActOnApprovals } from "@/lib/approvals/permissions";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import {
  canAccessAgentOrganization,
  canManageAgentExecutions,
  canViewAgentOperations,
  getAccessibleAgentOrganizationIds,
  getMembershipsForUser,
  isSuperAdmin,
  MUTATION_ROLES
} from "@/lib/authz";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

export type AgentEvaluationActionResult =
  | { ok: true; evaluation: AgentEvaluation; message: string }
  | { ok: false; error: string };

function isOutcome(value: string): value is AgentEvaluationOutcome {
  return (AGENT_EVALUATION_OUTCOMES as readonly string[]).includes(value);
}

function parseDimensions(
  input: Partial<QualityDimensionScores> | null | undefined
): Partial<QualityDimensionScores> {
  const result: Partial<QualityDimensionScores> = {};
  const keys: Array<keyof QualityDimensionScores> = [
    "accuracy_score",
    "completeness_score",
    "relevance_score",
    "usefulness_score",
    "source_quality_score",
    "confidence_calibration_score",
    "safety_score",
    "actionability_score"
  ];

  for (const key of keys) {
    const value = input?.[key];
    if (value == null) {
      continue;
    }

    if (!isValidQualityScore(value)) {
      throw new Error(`${key} must be a score from 1 to 5.`);
    }

    result[key] = value;
  }

  return result;
}

async function requireEvaluationContext(options?: {
  mutate?: boolean;
  manage?: boolean;
}) {
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
    return { ok: false as const, error: "Sign in to manage evaluations." };
  }

  const memberships = await getMembershipsForUser(supabase, user.id);

  if (options?.mutate) {
    const canMutate =
      isSuperAdmin(memberships) ||
      memberships.some((membership) => MUTATION_ROLES.includes(membership.role));

    if (!canMutate || !canActOnApprovals(memberships)) {
      return {
        ok: false as const,
        error: "You do not have permission to create evaluations."
      };
    }
  }

  if (options?.manage && !canManageAgentExecutions(memberships)) {
    return {
      ok: false as const,
      error: "Only admins can manage evaluation records."
    };
  }

  if (!canViewAgentOperations(memberships) && !canActOnApprovals(memberships)) {
    // Approvals viewers (including read_only) can list via list if we only use mutate for write.
    // For list-by-execution used from approval/agent pages:
  }

  return {
    ok: true as const,
    supabase,
    user,
    memberships,
    accessibleOrganizationIds: getAccessibleAgentOrganizationIds(memberships),
    isSuperAdmin: isSuperAdmin(memberships)
  };
}

export async function submitAgentEvaluation(input: {
  organizationId: string;
  agentExecutionId?: string | null;
  agentName?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  outcome?: AgentEvaluationOutcome | null;
  feedback?: string | null;
  feedbackCategories?: FeedbackCategory[];
  dimensions?: Partial<QualityDimensionScores>;
  metadata?: AgentEvaluationMetadata;
  evaluationType?: "human_review" | "usefulness" | "safety";
  outputTextForChecks?: string | null;
  citationPresent?: boolean | null;
  agentConfidence?: number | null;
}): Promise<AgentEvaluationActionResult> {
  const context = await requireEvaluationContext({ mutate: true });

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  if (!canAccessAgentOrganization(context.memberships, input.organizationId)) {
    return { ok: false, error: "Organization is outside your access scope." };
  }

  if (input.outcome && !isOutcome(input.outcome)) {
    return { ok: false, error: "Evaluation outcome is invalid." };
  }

  let dimensions: Partial<QualityDimensionScores>;

  try {
    dimensions = parseDimensions(input.dimensions);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid quality scores."
    };
  }

  const scrubbed = scrubEvaluationFeedback(input.feedback);

  if (!scrubbed.ok) {
    return { ok: false, error: scrubbed.error };
  }

  const categories = (input.feedbackCategories ?? []).filter((category) =>
    (FEEDBACK_CATEGORIES as readonly string[]).includes(category)
  );

  const automated =
    input.outputTextForChecks != null
      ? runAutomatedQualityChecks({
          outputText: input.outputTextForChecks,
          citationPresent: input.citationPresent,
          confidenceScore: input.agentConfidence
        })
      : null;

  if (automated && !dimensions.safety_score && automated.safety_score != null) {
    dimensions.safety_score = automated.safety_score;
  }

  if (
    automated &&
    !dimensions.completeness_score &&
    automated.completeness_score != null
  ) {
    dimensions.completeness_score = automated.completeness_score;
  }

  const quality = buildQualityResult({
    dimensions,
    outcome: input.outcome ?? null,
    feedback: scrubbed.feedback
  });

  const flags = collectLowQualityFlags({
    overallScore: quality.overall_score,
    safetyScore: quality.safety_score,
    agentConfidence: input.agentConfidence,
    outcome: input.outcome,
    citationPresent: input.citationPresent,
    automatedPassed: automated?.passed
  });

  const metadata: AgentEvaluationMetadata = {
    ...(input.metadata ?? {}),
    dimensions,
    overall_score: quality.overall_score,
    feedback_categories: categories,
    automated_checks: automated,
    agent_confidence: input.agentConfidence ?? null,
    low_quality_flags: flags
  };

  // Strip any accidental sensitive keys
  delete (metadata as Record<string, unknown>).prompt;
  delete (metadata as Record<string, unknown>).raw_response;
  delete (metadata as Record<string, unknown>).api_key;

  const store = new SupabaseAgentEvaluationStore(context.supabase);

  try {
    const evaluation = await store.insert({
      organization_id: input.organizationId,
      agent_execution_id: input.agentExecutionId ?? null,
      agent_name: input.agentName ?? null,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      evaluation_type: input.evaluationType ?? "human_review",
      evaluator_type: "human",
      evaluator_user_id: context.user.id,
      score: quality.overall_score,
      outcome: input.outcome ?? null,
      feedback: scrubbed.feedback,
      metadata
    });

    await recordAuditEvent(context.supabase, {
      organizationId: input.organizationId,
      actorUserId: context.user.id,
      action: AUDIT_ACTIONS.agentEvaluationCreate,
      targetTable: "agent_evaluations",
      recordId: evaluation.id,
      metadata: {
        evaluation_type: evaluation.evaluation_type,
        outcome: evaluation.outcome,
        score: evaluation.score,
        agent_name: evaluation.agent_name,
        flag_count: flags.length
      }
    });

    if (automated && !automated.passed) {
      await recordAuditEvent(context.supabase, {
        organizationId: input.organizationId,
        actorUserId: context.user.id,
        action: AUDIT_ACTIONS.agentQualityCheckFailed,
        targetTable: "agent_evaluations",
        recordId: evaluation.id,
        metadata: {
          agent_name: evaluation.agent_name,
          finding_count: automated.findings.filter((finding) => !finding.passed)
            .length
        }
      });
    }

    if (flags.length > 0) {
      await recordAuditEvent(context.supabase, {
        organizationId: input.organizationId,
        actorUserId: context.user.id,
        action: AUDIT_ACTIONS.agentLowQualityFlagged,
        targetTable: "agent_evaluations",
        recordId: evaluation.id,
        metadata: {
          agent_name: evaluation.agent_name,
          flags: flags.join(",")
        }
      });
    }

    revalidatePath("/agents");
    revalidatePath("/approvals");
    return {
      ok: true,
      evaluation,
      message: "Evaluation saved."
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not save the evaluation."
    };
  }
}

export async function updateAgentEvaluation(input: {
  evaluationId: string;
  organizationId: string;
  outcome?: AgentEvaluationOutcome | null;
  feedback?: string | null;
  dimensions?: Partial<QualityDimensionScores>;
  feedbackCategories?: FeedbackCategory[];
}): Promise<AgentEvaluationActionResult> {
  const context = await requireEvaluationContext({ mutate: true });

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  if (!canAccessAgentOrganization(context.memberships, input.organizationId)) {
    return { ok: false, error: "Organization is outside your access scope." };
  }

  const scrubbed = scrubEvaluationFeedback(input.feedback);

  if (!scrubbed.ok) {
    return { ok: false, error: scrubbed.error };
  }

  let dimensions: Partial<QualityDimensionScores> | undefined;

  try {
    dimensions = input.dimensions ? parseDimensions(input.dimensions) : undefined;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid quality scores."
    };
  }

  const store = new SupabaseAgentEvaluationStore(context.supabase);
  const existing = await store.findById(input.evaluationId, input.organizationId);

  if (!existing) {
    return { ok: false, error: "Evaluation was not found in your organization." };
  }

  const mergedDimensions = {
    ...(existing.metadata.dimensions ?? {}),
    ...(dimensions ?? {})
  };
  const quality = buildQualityResult({
    dimensions: mergedDimensions,
    outcome: input.outcome ?? existing.outcome,
    feedback: scrubbed.feedback ?? existing.feedback
  });

  const updated = await store.update(input.evaluationId, input.organizationId, {
    outcome: input.outcome ?? existing.outcome,
    feedback: scrubbed.feedback ?? existing.feedback,
    score: quality.overall_score,
    metadata: {
      ...existing.metadata,
      dimensions: mergedDimensions,
      overall_score: quality.overall_score,
      feedback_categories:
        input.feedbackCategories ?? existing.metadata.feedback_categories
    }
  });

  if (!updated) {
    return { ok: false, error: "Could not update the evaluation." };
  }

  await recordAuditEvent(context.supabase, {
    organizationId: input.organizationId,
    actorUserId: context.user.id,
    action: AUDIT_ACTIONS.agentEvaluationUpdate,
    targetTable: "agent_evaluations",
    recordId: updated.id,
    metadata: {
      evaluation_type: updated.evaluation_type,
      outcome: updated.outcome,
      score: updated.score
    }
  });

  revalidatePath("/agents");
  revalidatePath("/approvals");
  return { ok: true, evaluation: updated, message: "Evaluation updated." };
}

export async function listAgentEvaluationsForExecution(input: {
  organizationId: string;
  agentExecutionId: string;
}): Promise<
  | { ok: true; evaluations: AgentEvaluation[] }
  | { ok: false; error: string }
> {
  const context = await requireEvaluationContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  if (!canAccessAgentOrganization(context.memberships, input.organizationId)) {
    return { ok: false, error: "Organization is outside your access scope." };
  }

  const store = new SupabaseAgentEvaluationStore(context.supabase);
  const evaluations = await store.listForExecution(
    input.organizationId,
    input.agentExecutionId
  );

  return { ok: true, evaluations };
}

export async function recordLightweightApprovalEvaluation(input: {
  organizationId: string;
  approvalType: string;
  sourceId: string;
  outcome: AgentEvaluationOutcome;
  agentExecutionId?: string | null;
  agentName?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  usefulnessScore?: number | null;
  feedback?: string | null;
  agentConfidence?: number | null;
}): Promise<AgentEvaluationActionResult> {
  const dimensions: Partial<QualityDimensionScores> = {};

  if (input.usefulnessScore != null) {
    dimensions.usefulness_score = input.usefulnessScore;
  } else if (input.outcome === "accepted" || input.outcome === "approved_with_edits") {
    dimensions.usefulness_score = 4;
  } else if (input.outcome === "needs_revision") {
    dimensions.usefulness_score = 3;
  } else if (input.outcome === "rejected") {
    dimensions.usefulness_score = 2;
  }

  return submitAgentEvaluation({
    organizationId: input.organizationId,
    agentExecutionId: input.agentExecutionId,
    agentName: input.agentName,
    targetType: input.targetType ?? input.approvalType,
    targetId: input.targetId ?? input.sourceId,
    outcome: input.outcome,
    feedback: input.feedback,
    dimensions,
    agentConfidence: input.agentConfidence,
    metadata: {
      approval_type: input.approvalType,
      approval_item_id: `${input.approvalType}:${input.sourceId}`
    }
  });
}
