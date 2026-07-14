/**
 * Scoring model: each quality dimension uses integers 1–5 (1 = poor, 5 = excellent).
 * overall_score is the arithmetic mean of present dimension scores (rounded to 2 decimals).
 * Missing dimensions stay null and are excluded from the overall average.
 */

export const QUALITY_SCORE_MIN = 1;
export const QUALITY_SCORE_MAX = 5;

export const AGENT_EVALUATION_TYPES = [
  "human_review",
  "automated_quality_check",
  "source_quality",
  "output_completeness",
  "factuality",
  "usefulness",
  "safety"
] as const;

export type AgentEvaluationType = (typeof AGENT_EVALUATION_TYPES)[number];

export const AGENT_EVALUATOR_TYPES = ["human", "system", "policy"] as const;

export type AgentEvaluatorType = (typeof AGENT_EVALUATOR_TYPES)[number];

export const AGENT_EVALUATION_OUTCOMES = [
  "accepted",
  "rejected",
  "needs_revision",
  "approved_with_edits",
  "failed_quality_check"
] as const;

export type AgentEvaluationOutcome = (typeof AGENT_EVALUATION_OUTCOMES)[number];

export const FEEDBACK_CATEGORIES = [
  "incorrect_facts",
  "incomplete",
  "weak_sources",
  "poor_tone",
  "not_actionable",
  "irrelevant",
  "not_relevant",
  "unsafe",
  "too_generic",
  "excessive_confidence",
  "useful",
  "strong_fit",
  "ready_to_use"
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const SOURCE_QUALITY_CLASSES = [
  "official_institutional",
  "government_public_dataset",
  "recognized_third_party",
  "unknown"
] as const;

export type SourceQualityClass = (typeof SOURCE_QUALITY_CLASSES)[number];

export type QualityDimensionScores = {
  accuracy_score: number | null;
  completeness_score: number | null;
  relevance_score: number | null;
  usefulness_score: number | null;
  source_quality_score: number | null;
  confidence_calibration_score: number | null;
  safety_score: number | null;
  actionability_score: number | null;
};

export type QualityResult = QualityDimensionScores & {
  overall_score: number | null;
  outcome: AgentEvaluationOutcome | null;
  feedback: string | null;
};

export type RevisionSignal = {
  original_length: number | null;
  final_length: number | null;
  changed: boolean;
  percentage_changed: number | null;
};

export type AgentEvaluationMetadata = {
  dimensions?: Partial<QualityDimensionScores>;
  overall_score?: number | null;
  feedback_categories?: FeedbackCategory[];
  revision?: RevisionSignal | null;
  source_quality_class?: SourceQualityClass | null;
  automated_checks?: AutomatedQualityCheckResult | null;
  model?: string | null;
  provider?: string | null;
  approval_type?: string | null;
  approval_item_id?: string | null;
  agent_confidence?: number | null;
  low_quality_flags?: string[];
  /** Discrete minutes saved estimate from the reviewer (no narrative required). */
  saved_time_minutes?: number | null;
  // Never store prompts, secrets, or raw LLM responses here.
};

export type AgentEvaluation = {
  id: string;
  organization_id: string;
  agent_execution_id: string | null;
  agent_name: string | null;
  target_type: string | null;
  target_id: string | null;
  evaluation_type: AgentEvaluationType;
  evaluator_type: AgentEvaluatorType;
  evaluator_user_id: string | null;
  score: number | null;
  outcome: AgentEvaluationOutcome | null;
  feedback: string | null;
  metadata: AgentEvaluationMetadata;
  created_at: string;
  updated_at: string;
};

export type AgentEvaluationInsert = {
  organization_id: string;
  agent_execution_id?: string | null;
  agent_name?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  evaluation_type: AgentEvaluationType;
  evaluator_type: AgentEvaluatorType;
  evaluator_user_id?: string | null;
  score?: number | null;
  outcome?: AgentEvaluationOutcome | null;
  feedback?: string | null;
  metadata?: AgentEvaluationMetadata;
};

export type AutomatedQualityCheckFinding = {
  code: string;
  passed: boolean;
  severity: "info" | "warn" | "fail";
  message: string;
};

export type AutomatedQualityCheckResult = {
  passed: boolean;
  findings: AutomatedQualityCheckFinding[];
  safety_score: number | null;
  completeness_score: number | null;
};

export function isValidQualityScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= QUALITY_SCORE_MIN &&
    value <= QUALITY_SCORE_MAX
  );
}

export function computeOverallQualityScore(
  dimensions: Partial<QualityDimensionScores>
): number | null {
  const values = [
    dimensions.accuracy_score,
    dimensions.completeness_score,
    dimensions.relevance_score,
    dimensions.usefulness_score,
    dimensions.source_quality_score,
    dimensions.confidence_calibration_score,
    dimensions.safety_score,
    dimensions.actionability_score
  ].filter((value): value is number => isValidQualityScore(value));

  if (values.length === 0) {
    return null;
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(average * 100) / 100;
}

export function buildQualityResult(input: {
  dimensions?: Partial<QualityDimensionScores>;
  outcome?: AgentEvaluationOutcome | null;
  feedback?: string | null;
}): QualityResult {
  const dimensions: QualityDimensionScores = {
    accuracy_score: input.dimensions?.accuracy_score ?? null,
    completeness_score: input.dimensions?.completeness_score ?? null,
    relevance_score: input.dimensions?.relevance_score ?? null,
    usefulness_score: input.dimensions?.usefulness_score ?? null,
    source_quality_score: input.dimensions?.source_quality_score ?? null,
    confidence_calibration_score:
      input.dimensions?.confidence_calibration_score ?? null,
    safety_score: input.dimensions?.safety_score ?? null,
    actionability_score: input.dimensions?.actionability_score ?? null
  };

  return {
    ...dimensions,
    overall_score: computeOverallQualityScore(dimensions),
    outcome: input.outcome ?? null,
    feedback: input.feedback ?? null
  };
}

export function computeRevisionSignal(
  originalText: string | null | undefined,
  finalText: string | null | undefined
): RevisionSignal {
  const original = originalText ?? "";
  const final = finalText ?? "";
  const originalLength = original.length;
  const finalLength = final.length;
  const changed = original !== final;
  const baseline = Math.max(originalLength, 1);
  const delta = Math.abs(finalLength - originalLength);
  const percentageChanged = changed
    ? Math.min(100, Math.round((delta / baseline) * 10000) / 100)
    : 0;

  return {
    original_length: originalLength,
    final_length: finalLength,
    changed,
    percentage_changed: percentageChanged
  };
}
