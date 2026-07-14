export type VariantQualitySample = {
  experiment_variant: "control" | "treatment";
  overall_score: number | null;
  outcome: "accepted" | "rejected" | "needs_revision" | string | null;
  estimated_cost_usd: number | null;
  latency_ms: number | null;
  safety_flags: number;
  citation_present: boolean;
  high_confidence_rejection: boolean;
};

export type VariantComparisonMetrics = {
  variant: "control" | "treatment";
  sample_count: number;
  average_quality_score: number | null;
  acceptance_rate: number | null;
  rejection_rate: number | null;
  needs_revision_rate: number | null;
  cost_per_accepted_output: number | null;
  average_latency_ms: number | null;
  safety_flag_rate: number | null;
  source_citation_rate: number | null;
  high_confidence_rejection_rate: number | null;
};

function rate(numer: number, denom: number): number | null {
  if (denom <= 0) {
    return null;
  }
  return numer / denom;
}

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeVariantMetrics(
  samples: VariantQualitySample[],
  variant: "control" | "treatment"
): VariantComparisonMetrics {
  const rows = samples.filter((sample) => sample.experiment_variant === variant);
  const outcomes = rows.filter((row) => row.outcome != null);
  const accepted = outcomes.filter((row) => row.outcome === "accepted");
  const rejected = outcomes.filter((row) => row.outcome === "rejected");
  const needsRevision = outcomes.filter(
    (row) => row.outcome === "needs_revision"
  );
  const acceptedCosts = accepted
    .map((row) => row.estimated_cost_usd)
    .filter((value): value is number => typeof value === "number");
  const latencies = rows
    .map((row) => row.latency_ms)
    .filter((value): value is number => typeof value === "number");
  const scores = rows
    .map((row) => row.overall_score)
    .filter((value): value is number => typeof value === "number");

  return {
    variant,
    sample_count: rows.length,
    average_quality_score: mean(scores),
    acceptance_rate: rate(accepted.length, outcomes.length),
    rejection_rate: rate(rejected.length, outcomes.length),
    needs_revision_rate: rate(needsRevision.length, outcomes.length),
    cost_per_accepted_output:
      acceptedCosts.length > 0 ? mean(acceptedCosts) : null,
    average_latency_ms: mean(latencies),
    safety_flag_rate: rate(
      rows.filter((row) => row.safety_flags > 0).length,
      rows.length
    ),
    source_citation_rate: rate(
      rows.filter((row) => row.citation_present).length,
      rows.length
    ),
    high_confidence_rejection_rate: rate(
      rows.filter((row) => row.high_confidence_rejection).length,
      rows.length
    )
  };
}

/** Compare control vs treatment for a rollout. Never auto-promotes. */
export function compareRolloutVariants(samples: VariantQualitySample[]): {
  control: VariantComparisonMetrics;
  treatment: VariantComparisonMetrics;
} {
  return {
    control: summarizeVariantMetrics(samples, "control"),
    treatment: summarizeVariantMetrics(samples, "treatment")
  };
}
