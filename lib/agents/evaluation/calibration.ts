import type { AgentEvaluation, AgentEvaluationOutcome } from "./types";

export type ConfidenceCalibrationBucket = {
  band: "high" | "medium" | "low" | "unknown";
  evaluations: number;
  accepted: number;
  rejected: number;
  needs_revision: number;
  acceptance_rate: number | null;
  rejection_rate: number | null;
  average_revision_percentage: number | null;
};

export type ConfidenceCalibrationReport = {
  buckets: ConfidenceCalibrationBucket[];
  high_confidence_rejection_rate: number | null;
  low_confidence_acceptance_rate: number | null;
  patterns: string[];
};

function confidenceBand(
  confidence: number | null | undefined
): ConfidenceCalibrationBucket["band"] {
  if (confidence == null || !Number.isFinite(confidence)) {
    return "unknown";
  }

  if (confidence >= 0.8) {
    return "high";
  }

  if (confidence >= 0.5) {
    return "medium";
  }

  return "low";
}

function emptyBucket(
  band: ConfidenceCalibrationBucket["band"]
): ConfidenceCalibrationBucket {
  return {
    band,
    evaluations: 0,
    accepted: 0,
    rejected: 0,
    needs_revision: 0,
    acceptance_rate: null,
    rejection_rate: null,
    average_revision_percentage: null
  };
}

function finalizeBucket(bucket: ConfidenceCalibrationBucket): ConfidenceCalibrationBucket {
  if (bucket.evaluations === 0) {
    return bucket;
  }

  return {
    ...bucket,
    acceptance_rate: bucket.accepted / bucket.evaluations,
    rejection_rate: bucket.rejected / bucket.evaluations
  };
}

export function buildConfidenceCalibrationReport(
  evaluations: AgentEvaluation[]
): ConfidenceCalibrationReport {
  const buckets: Record<
    ConfidenceCalibrationBucket["band"],
    ConfidenceCalibrationBucket & { revisionSum: number; revisionCount: number }
  > = {
    high: { ...emptyBucket("high"), revisionSum: 0, revisionCount: 0 },
    medium: { ...emptyBucket("medium"), revisionSum: 0, revisionCount: 0 },
    low: { ...emptyBucket("low"), revisionSum: 0, revisionCount: 0 },
    unknown: { ...emptyBucket("unknown"), revisionSum: 0, revisionCount: 0 }
  };

  for (const evaluation of evaluations) {
    if (evaluation.evaluator_type !== "human" || !evaluation.outcome) {
      continue;
    }

    const confidence = evaluation.metadata.agent_confidence;
    const band = confidenceBand(
      typeof confidence === "number" ? confidence : null
    );
    const bucket = buckets[band];
    bucket.evaluations += 1;

    const outcome = evaluation.outcome as AgentEvaluationOutcome;
    if (outcome === "accepted" || outcome === "approved_with_edits") {
      bucket.accepted += 1;
    }

    if (outcome === "rejected") {
      bucket.rejected += 1;
    }

    if (outcome === "needs_revision") {
      bucket.needs_revision += 1;
    }

    const revisionPct = evaluation.metadata.revision?.percentage_changed;
    if (typeof revisionPct === "number" && Number.isFinite(revisionPct)) {
      bucket.revisionSum += revisionPct;
      bucket.revisionCount += 1;
    }
  }

  const finalized = (Object.keys(buckets) as Array<keyof typeof buckets>).map(
    (band) => {
      const bucket = buckets[band];
      const base = finalizeBucket(bucket);
      return {
        ...base,
        average_revision_percentage:
          bucket.revisionCount > 0
            ? Math.round((bucket.revisionSum / bucket.revisionCount) * 100) / 100
            : null
      };
    }
  );

  const high = finalized.find((bucket) => bucket.band === "high");
  const low = finalized.find((bucket) => bucket.band === "low");
  const patterns: string[] = [];

  if (high && high.evaluations >= 3 && (high.rejection_rate ?? 0) >= 0.4) {
    patterns.push("high_confidence_frequent_rejection");
  }

  if (low && low.evaluations >= 3 && (low.acceptance_rate ?? 0) >= 0.7) {
    patterns.push("low_confidence_frequent_acceptance");
  }

  return {
    buckets: finalized,
    high_confidence_rejection_rate: high?.rejection_rate ?? null,
    low_confidence_acceptance_rate: low?.acceptance_rate ?? null,
    patterns
  };
}
