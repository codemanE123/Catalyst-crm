import type { AgentEvaluation } from "./types";
import { buildConfidenceCalibrationReport } from "./calibration";
import { resolveAgentQualityConfig } from "./config";

export type AgentQualityDashboardMetrics = {
  average_overall_quality_score: number | null;
  acceptance_rate: number | null;
  rejection_rate: number | null;
  needs_revision_rate: number | null;
  accepted_with_edits_rate: number | null;
  average_score_by_agent: Array<{
    agent_name: string;
    average_score: number;
    evaluations: number;
  }>;
  average_score_by_model: Array<{
    model: string;
    average_score: number;
    evaluations: number;
  }>;
  average_score_by_approval_type: Array<{
    approval_type: string;
    average_score: number;
    evaluations: number;
  }>;
  low_quality_last_7_days: number;
  high_confidence_rejected: number;
  outputs_without_citations: number;
  average_revision_percentage: number | null;
  calibration_patterns: string[];
  alerts: string[];
};

export type AgentQualitySummary = {
  agent_name: string;
  total_evaluated: number;
  acceptance_rate: number | null;
  average_quality_score: number | null;
  average_safety_score: number | null;
  average_source_quality: number | null;
  rejection_outcomes: number;
  common_feedback_categories: Array<{ category: string; count: number }>;
  cost_per_accepted_output_usd: number | null | "unknown";
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function rate(count: number, total: number): number | null {
  if (total <= 0) {
    return null;
  }

  return round2(count / total);
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function calculateAgentQualityDashboardMetrics(
  evaluations: AgentEvaluation[],
  options?: {
    since7DaysIso?: string;
    env?: NodeJS.ProcessEnv;
  }
): AgentQualityDashboardMetrics {
  const config = resolveAgentQualityConfig(options?.env);
  const human = evaluations.filter(
    (row) => row.evaluator_type === "human" && row.outcome
  );
  const total = human.length;
  const accepted = human.filter(
    (row) => row.outcome === "accepted" || row.outcome === "approved_with_edits"
  ).length;
  const rejected = human.filter((row) => row.outcome === "rejected").length;
  const needsRevision = human.filter(
    (row) => row.outcome === "needs_revision"
  ).length;
  const acceptedWithEdits = human.filter(
    (row) => row.outcome === "approved_with_edits"
  ).length;

  const byAgent = new Map<string, number[]>();
  const byModel = new Map<string, number[]>();
  const byApprovalType = new Map<string, number[]>();
  const revisionPercentages: number[] = [];
  let lowQualityLast7 = 0;
  let highConfidenceRejected = 0;
  let withoutCitations = 0;

  for (const evaluation of evaluations) {
    const score = evaluation.score ?? evaluation.metadata.overall_score ?? null;
    if (typeof score === "number" && evaluation.agent_name) {
      const list = byAgent.get(evaluation.agent_name) ?? [];
      list.push(score);
      byAgent.set(evaluation.agent_name, list);
    }

    if (typeof score === "number" && evaluation.metadata.model) {
      const list = byModel.get(evaluation.metadata.model) ?? [];
      list.push(score);
      byModel.set(evaluation.metadata.model, list);
    }

    if (typeof score === "number" && evaluation.metadata.approval_type) {
      const list = byApprovalType.get(evaluation.metadata.approval_type) ?? [];
      list.push(score);
      byApprovalType.set(evaluation.metadata.approval_type, list);
    }

    const revision = evaluation.metadata.revision?.percentage_changed;
    if (typeof revision === "number") {
      revisionPercentages.push(revision);
    }

    const since7 = options?.since7DaysIso;
    if (
      since7 &&
      evaluation.created_at >= since7 &&
      typeof score === "number" &&
      score < config.lowScoreThreshold
    ) {
      lowQualityLast7 += 1;
    }

    if (
      evaluation.outcome === "rejected" &&
      typeof evaluation.metadata.agent_confidence === "number" &&
      evaluation.metadata.agent_confidence >= 0.8
    ) {
      highConfidenceRejected += 1;
    }

    if (evaluation.metadata.low_quality_flags?.includes("missing_citations")) {
      withoutCitations += 1;
    }
  }

  const calibration = buildConfidenceCalibrationReport(evaluations);
  const rejectionRate = rate(rejected, total);
  const alerts: string[] = [];

  if (lowQualityLast7 > 0) {
    alerts.push(`${lowQualityLast7} low-quality outputs in the last 7 days.`);
  }

  if (highConfidenceRejected > 0) {
    alerts.push(
      `${highConfidenceRejected} high-confidence outputs were rejected.`
    );
  }

  if (
    rejectionRate != null &&
    rejectionRate >= config.alertRejectionRate &&
    total >= 5
  ) {
    alerts.push("Agent rejection rate exceeds configured threshold.");
  }

  for (const pattern of calibration.patterns) {
    alerts.push(pattern.replaceAll("_", " "));
  }

  return {
    average_overall_quality_score: average(
      evaluations
        .map((row) => row.score ?? row.metadata.overall_score)
        .filter((value): value is number => typeof value === "number")
    ),
    acceptance_rate: rate(accepted, total),
    rejection_rate: rejectionRate,
    needs_revision_rate: rate(needsRevision, total),
    accepted_with_edits_rate: rate(acceptedWithEdits, total),
    average_score_by_agent: [...byAgent.entries()]
      .map(([agent_name, scores]) => ({
        agent_name,
        average_score: average(scores) ?? 0,
        evaluations: scores.length
      }))
      .sort((left, right) => right.evaluations - left.evaluations),
    average_score_by_model: [...byModel.entries()]
      .map(([model, scores]) => ({
        model,
        average_score: average(scores) ?? 0,
        evaluations: scores.length
      }))
      .sort((left, right) => right.evaluations - left.evaluations),
    average_score_by_approval_type: [...byApprovalType.entries()]
      .map(([approval_type, scores]) => ({
        approval_type,
        average_score: average(scores) ?? 0,
        evaluations: scores.length
      }))
      .sort((left, right) => right.evaluations - left.evaluations),
    low_quality_last_7_days: lowQualityLast7,
    high_confidence_rejected: highConfidenceRejected,
    outputs_without_citations: withoutCitations,
    average_revision_percentage: average(revisionPercentages),
    calibration_patterns: calibration.patterns,
    alerts
  };
}

export function summarizeAgentQuality(
  agentName: string,
  evaluations: AgentEvaluation[],
  options?: {
    acceptedUsageCostUsd?: number | null;
    acceptedCountForCost?: number | null;
  }
): AgentQualitySummary {
  const scoped = evaluations.filter((row) => row.agent_name === agentName);
  const human = scoped.filter((row) => row.evaluator_type === "human" && row.outcome);
  const accepted = human.filter(
    (row) => row.outcome === "accepted" || row.outcome === "approved_with_edits"
  ).length;
  const rejected = human.filter((row) => row.outcome === "rejected").length;
  const categories = new Map<string, number>();

  for (const evaluation of scoped) {
    for (const category of evaluation.metadata.feedback_categories ?? []) {
      categories.set(category, (categories.get(category) ?? 0) + 1);
    }
  }

  let costPerAccepted: number | null | "unknown" = "unknown";
  if (
    options?.acceptedUsageCostUsd == null ||
    options.acceptedCountForCost == null
  ) {
    costPerAccepted = "unknown";
  } else if (options.acceptedCountForCost <= 0) {
    costPerAccepted = null;
  } else {
    costPerAccepted = round2(
      options.acceptedUsageCostUsd / options.acceptedCountForCost
    );
  }

  return {
    agent_name: agentName,
    total_evaluated: scoped.length,
    acceptance_rate: rate(accepted, human.length),
    average_quality_score: average(
      scoped
        .map((row) => row.score ?? row.metadata.overall_score)
        .filter((value): value is number => typeof value === "number")
    ),
    average_safety_score: average(
      scoped
        .map((row) => row.metadata.dimensions?.safety_score)
        .filter((value): value is number => typeof value === "number")
    ),
    average_source_quality: average(
      scoped
        .map((row) => row.metadata.dimensions?.source_quality_score)
        .filter((value): value is number => typeof value === "number")
    ),
    rejection_outcomes: rejected,
    common_feedback_categories: [...categories.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8),
    cost_per_accepted_output_usd: costPerAccepted
  };
}
