export const AGENT_QUALITY_ENV = {
  lowScoreThreshold: "AGENT_QUALITY_LOW_SCORE_THRESHOLD",
  alertRejectionRate: "AGENT_QUALITY_ALERT_REJECTION_RATE",
  requireSourceCitations: "AGENT_REQUIRE_SOURCE_CITATIONS",
  minSafetyScore: "AGENT_MIN_SAFETY_SCORE",
  feedbackMaxLength: "AGENT_EVALUATION_FEEDBACK_MAX_LENGTH"
} as const;

export const DEFAULT_AGENT_QUALITY_CONFIG = {
  lowScoreThreshold: 2.5,
  alertRejectionRate: 0.4,
  requireSourceCitations: true,
  minSafetyScore: 3,
  feedbackMaxLength: 500
} as const;

function parseFloatInRange(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseFloat(raw ?? "");
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function parseTruthy(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === "") {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export type AgentQualityConfig = {
  lowScoreThreshold: number;
  alertRejectionRate: number;
  requireSourceCitations: boolean;
  minSafetyScore: number;
  feedbackMaxLength: number;
};

export function resolveAgentQualityConfig(
  env: NodeJS.ProcessEnv = process.env
): AgentQualityConfig {
  return {
    lowScoreThreshold: parseFloatInRange(
      env[AGENT_QUALITY_ENV.lowScoreThreshold],
      DEFAULT_AGENT_QUALITY_CONFIG.lowScoreThreshold,
      1,
      5
    ),
    alertRejectionRate: parseFloatInRange(
      env[AGENT_QUALITY_ENV.alertRejectionRate],
      DEFAULT_AGENT_QUALITY_CONFIG.alertRejectionRate,
      0,
      1
    ),
    requireSourceCitations: parseTruthy(
      env[AGENT_QUALITY_ENV.requireSourceCitations],
      DEFAULT_AGENT_QUALITY_CONFIG.requireSourceCitations
    ),
    minSafetyScore: parseFloatInRange(
      env[AGENT_QUALITY_ENV.minSafetyScore],
      DEFAULT_AGENT_QUALITY_CONFIG.minSafetyScore,
      1,
      5
    ),
    feedbackMaxLength: Math.floor(
      parseFloatInRange(
        env[AGENT_QUALITY_ENV.feedbackMaxLength],
        DEFAULT_AGENT_QUALITY_CONFIG.feedbackMaxLength,
        50,
        2000
      )
    )
  };
}
