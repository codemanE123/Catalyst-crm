export const AGENT_PROMPT_ENV = {
  maxTemplateChars: "AGENT_PROMPT_MAX_TEMPLATE_CHARS",
  maxOutputTokens: "AGENT_PROMPT_MAX_OUTPUT_TOKENS",
  rolloutDefaultPercentage: "AGENT_ROLLOUT_DEFAULT_PERCENTAGE",
  rolloutAssignmentKey: "AGENT_ROLLOUT_ASSIGNMENT_KEY",
  requireSafetyPolicy: "AGENT_PROMPT_REQUIRE_SAFETY_POLICY",
  requireSchemaVersion: "AGENT_PROMPT_REQUIRE_SCHEMA_VERSION",
  activationMinQuality: "AGENT_PROMPT_ACTIVATION_MIN_QUALITY"
} as const;

export const DEFAULT_AGENT_PROMPT_CONFIG = {
  maxTemplateChars: 24000,
  maxOutputTokens: 4000,
  rolloutDefaultPercentage: 0,
  /**
   * Default bucket key for percentage rollouts.
   * Same organization stays in the same variant for the life of a rollout.
   */
  rolloutAssignmentKey: "organization_id" as const,
  requireSafetyPolicy: true,
  requireSchemaVersion: true,
  activationMinQuality: 3
} as const;

export type RolloutAssignmentKey =
  | "organization_id"
  | "user_id"
  | "target_id";

export type AgentPromptConfig = {
  maxTemplateChars: number;
  maxOutputTokens: number;
  rolloutDefaultPercentage: number;
  rolloutAssignmentKey: RolloutAssignmentKey;
  requireSafetyPolicy: boolean;
  requireSchemaVersion: boolean;
  activationMinQuality: number;
};

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

function parseAssignmentKey(raw: string | undefined): RolloutAssignmentKey {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "user_id" || value === "target_id" || value === "organization_id") {
    return value;
  }
  return DEFAULT_AGENT_PROMPT_CONFIG.rolloutAssignmentKey;
}

export function resolveAgentPromptConfig(
  env: NodeJS.ProcessEnv = process.env
): AgentPromptConfig {
  const pct = parseIntInRange(
    env[AGENT_PROMPT_ENV.rolloutDefaultPercentage],
    DEFAULT_AGENT_PROMPT_CONFIG.rolloutDefaultPercentage,
    0,
    100
  );
  const allowed = new Set([0, 10, 25, 50, 100]);

  return {
    maxTemplateChars: parseIntInRange(
      env[AGENT_PROMPT_ENV.maxTemplateChars],
      DEFAULT_AGENT_PROMPT_CONFIG.maxTemplateChars,
      500,
      100_000
    ),
    maxOutputTokens: parseIntInRange(
      env[AGENT_PROMPT_ENV.maxOutputTokens],
      DEFAULT_AGENT_PROMPT_CONFIG.maxOutputTokens,
      64,
      16_000
    ),
    rolloutDefaultPercentage: allowed.has(pct) ? pct : 0,
    rolloutAssignmentKey: parseAssignmentKey(
      env[AGENT_PROMPT_ENV.rolloutAssignmentKey]
    ),
    requireSafetyPolicy: parseTruthy(
      env[AGENT_PROMPT_ENV.requireSafetyPolicy],
      DEFAULT_AGENT_PROMPT_CONFIG.requireSafetyPolicy
    ),
    requireSchemaVersion: parseTruthy(
      env[AGENT_PROMPT_ENV.requireSchemaVersion],
      DEFAULT_AGENT_PROMPT_CONFIG.requireSchemaVersion
    ),
    activationMinQuality: parseFloatInRange(
      env[AGENT_PROMPT_ENV.activationMinQuality],
      DEFAULT_AGENT_PROMPT_CONFIG.activationMinQuality,
      1,
      5
    )
  };
}
