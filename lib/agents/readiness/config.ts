export const AGENT_READINESS_ENV = {
  enabled: "AGENT_READINESS_ENABLED",
  productionRequired: "AGENT_READINESS_PRODUCTION_REQUIRED",
  stagingRequired: "AGENT_READINESS_STAGING_REQUIRED",
  productionExpiryDays: "AGENT_READINESS_PRODUCTION_EXPIRY_DAYS",
  stagingExpiryDays: "AGENT_READINESS_STAGING_EXPIRY_DAYS",
  maxSimulationAgeHours: "AGENT_READINESS_MAX_SIMULATION_AGE_HOURS",
  requireSeparationOfDuties: "AGENT_READINESS_REQUIRE_SEPARATION_OF_DUTIES",
  minQualityScore: "AGENT_READINESS_MIN_QUALITY_SCORE",
  minSafetyScore: "AGENT_READINESS_MIN_SAFETY_SCORE"
} as const;

export const DEFAULT_AGENT_READINESS_CONFIG = {
  enabled: true,
  productionRequired: true,
  stagingRequired: false,
  productionExpiryDays: 30,
  stagingExpiryDays: 14,
  maxSimulationAgeHours: 168,
  requireSeparationOfDuties: true,
  minQualityScore: 3,
  minSafetyScore: 3
} as const;

export type AgentReadinessConfig = {
  enabled: boolean;
  productionRequired: boolean;
  stagingRequired: boolean;
  productionExpiryDays: number;
  stagingExpiryDays: number;
  maxSimulationAgeHours: number;
  requireSeparationOfDuties: boolean;
  minQualityScore: number;
  minSafetyScore: number;
};

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

function parseIntInRange(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

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

export function resolveAgentReadinessConfig(
  env: NodeJS.ProcessEnv = process.env
): AgentReadinessConfig {
  return {
    enabled: parseTruthy(
      env[AGENT_READINESS_ENV.enabled],
      DEFAULT_AGENT_READINESS_CONFIG.enabled
    ),
    productionRequired: parseTruthy(
      env[AGENT_READINESS_ENV.productionRequired],
      DEFAULT_AGENT_READINESS_CONFIG.productionRequired
    ),
    stagingRequired: parseTruthy(
      env[AGENT_READINESS_ENV.stagingRequired],
      DEFAULT_AGENT_READINESS_CONFIG.stagingRequired
    ),
    productionExpiryDays: parseIntInRange(
      env[AGENT_READINESS_ENV.productionExpiryDays],
      DEFAULT_AGENT_READINESS_CONFIG.productionExpiryDays,
      1,
      365
    ),
    stagingExpiryDays: parseIntInRange(
      env[AGENT_READINESS_ENV.stagingExpiryDays],
      DEFAULT_AGENT_READINESS_CONFIG.stagingExpiryDays,
      1,
      180
    ),
    maxSimulationAgeHours: parseIntInRange(
      env[AGENT_READINESS_ENV.maxSimulationAgeHours],
      DEFAULT_AGENT_READINESS_CONFIG.maxSimulationAgeHours,
      1,
      720
    ),
    requireSeparationOfDuties: parseTruthy(
      env[AGENT_READINESS_ENV.requireSeparationOfDuties],
      DEFAULT_AGENT_READINESS_CONFIG.requireSeparationOfDuties
    ),
    minQualityScore: parseFloatInRange(
      env[AGENT_READINESS_ENV.minQualityScore],
      DEFAULT_AGENT_READINESS_CONFIG.minQualityScore,
      1,
      5
    ),
    minSafetyScore: parseFloatInRange(
      env[AGENT_READINESS_ENV.minSafetyScore],
      DEFAULT_AGENT_READINESS_CONFIG.minSafetyScore,
      1,
      5
    )
  };
}
