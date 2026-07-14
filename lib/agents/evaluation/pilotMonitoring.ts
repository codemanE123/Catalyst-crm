import type { AgentEvaluation } from "./types";

/**
 * Pilot monitoring metrics for Phase 5.6 — measure whether real users find
 * agent outputs useful without storing private narrative feedback.
 */
export type AgentPilotMonitoringMetrics = {
  candidate_approval_rate: number | null;
  enrichment_acceptance_rate: number | null;
  outreach_draft_use_rate: number | null;
  average_quality_score: number | null;
  cost_per_approved_prospect_usd: number | null | "unknown";
  cost_per_saved_outreach_draft_usd: number | null | "unknown";
  failed_jobs: number;
  policy_denials: number;
  budget_denials: number;
  average_saved_time_minutes: number | null;
  feedback_category_counts: Array<{ category: string; count: number }>;
  candidates_approved: number;
  candidates_rejected: number;
  enrichment_accepted: number;
  enrichment_rejected: number;
  outreach_drafts_generated: number;
  outreach_drafts_saved: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return round2(numerator / denominator);
}

function costPer(
  totalCostUsd: number | null | undefined,
  count: number
): number | null | "unknown" {
  if (totalCostUsd == null) {
    return "unknown";
  }

  if (count <= 0) {
    return null;
  }

  return round2(totalCostUsd / count);
}

export function calculateAgentPilotMonitoringMetrics(input: {
  candidatesApproved: number;
  candidatesRejected: number;
  enrichmentAccepted: number;
  enrichmentRejected: number;
  outreachDraftsGenerated: number;
  outreachDraftsSaved: number;
  failedJobs: number;
  policyDenials: number;
  budgetDenials: number;
  averageQualityScore: number | null;
  prospectGenerationSpendUsd?: number | null;
  outreachDraftSpendUsd?: number | null;
  evaluations?: AgentEvaluation[];
}): AgentPilotMonitoringMetrics {
  const categoryCounts = new Map<string, number>();
  const savedTimes: number[] = [];

  for (const evaluation of input.evaluations ?? []) {
    for (const category of evaluation.metadata.feedback_categories ?? []) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }

    const saved = evaluation.metadata.saved_time_minutes;
    if (typeof saved === "number" && Number.isFinite(saved) && saved >= 0) {
      savedTimes.push(saved);
    }
  }

  return {
    candidate_approval_rate: rate(
      input.candidatesApproved,
      input.candidatesApproved + input.candidatesRejected
    ),
    enrichment_acceptance_rate: rate(
      input.enrichmentAccepted,
      input.enrichmentAccepted + input.enrichmentRejected
    ),
    outreach_draft_use_rate: rate(
      input.outreachDraftsSaved,
      input.outreachDraftsGenerated
    ),
    average_quality_score: input.averageQualityScore,
    cost_per_approved_prospect_usd: costPer(
      input.prospectGenerationSpendUsd,
      input.candidatesApproved
    ),
    cost_per_saved_outreach_draft_usd: costPer(
      input.outreachDraftSpendUsd,
      input.outreachDraftsSaved
    ),
    failed_jobs: input.failedJobs,
    policy_denials: input.policyDenials,
    budget_denials: input.budgetDenials,
    average_saved_time_minutes:
      savedTimes.length === 0
        ? null
        : round2(
            savedTimes.reduce((sum, value) => sum + value, 0) / savedTimes.length
          ),
    feedback_category_counts: [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 12),
    candidates_approved: input.candidatesApproved,
    candidates_rejected: input.candidatesRejected,
    enrichment_accepted: input.enrichmentAccepted,
    enrichment_rejected: input.enrichmentRejected,
    outreach_drafts_generated: input.outreachDraftsGenerated,
    outreach_drafts_saved: input.outreachDraftsSaved
  };
}

export function countHumanOutcomesForApprovalType(
  evaluations: AgentEvaluation[],
  approvalType: string,
  outcomes: Array<AgentEvaluation["outcome"]>
): number {
  return evaluations.filter(
    (row) =>
      row.evaluator_type === "human" &&
      row.metadata.approval_type === approvalType &&
      outcomes.includes(row.outcome)
  ).length;
}
