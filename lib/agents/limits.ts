import { resolveAgentMaxAttempts } from "./retryPolicy";

export const AGENT_LIMIT_ENV = {
  maxExecutionsPerHour: "AGENT_MAX_EXECUTIONS_PER_HOUR",
  maxLlmCallsPerDay: "LLM_MAX_CALLS_PER_DAY",
  dailyBudgetUsd: "LLM_DAILY_BUDGET_USD",
  monthlyBudgetUsd: "LLM_MONTHLY_BUDGET_USD",
  maxConcurrentExecutions: "AGENT_MAX_CONCURRENT_EXECUTIONS",
  maxCandidateBatchSize: "AGENT_MAX_CANDIDATE_BATCH_SIZE",
  maxChainDepth: "AGENT_MAX_CHAIN_DEPTH",
  maxPromptChars: "AGENT_MAX_PROMPT_CHARS",
  maxOutputChars: "AGENT_MAX_OUTPUT_CHARS",
  featureEnabled: "AGENT_FEATURE_ENABLED"
} as const;

export const DEFAULT_AGENT_LIMITS = {
  maxExecutionsPerHour: 60,
  maxLlmCallsPerDay: 200,
  dailyBudgetUsd: 25,
  monthlyBudgetUsd: 250,
  maxConcurrentExecutions: 5,
  maxCandidateBatchSize: 50,
  maxChainDepth: 5,
  maxPromptChars: 24_000,
  maxOutputChars: 8_000,
  featureEnabled: true
} as const;

function parsePositiveInt(
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

function parsePositiveFloat(
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

function parseFeatureEnabled(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === "") {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  return fallback;
}

export type AgentSafetyLimits = {
  maxExecutionsPerHour: number;
  maxLlmCallsPerDay: number;
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
  maxConcurrentExecutions: number;
  maxCandidateBatchSize: number;
  maxChainDepth: number;
  maxPromptChars: number;
  maxOutputChars: number;
  maxAutomaticRetries: number;
  featureEnabled: boolean;
};

export function resolveAgentSafetyLimits(
  env: NodeJS.ProcessEnv = process.env,
  overrides?: Partial<AgentSafetyLimits>
): AgentSafetyLimits {
  const base: AgentSafetyLimits = {
    maxExecutionsPerHour: parsePositiveInt(
      env[AGENT_LIMIT_ENV.maxExecutionsPerHour],
      DEFAULT_AGENT_LIMITS.maxExecutionsPerHour,
      1,
      10_000
    ),
    maxLlmCallsPerDay: parsePositiveInt(
      env[AGENT_LIMIT_ENV.maxLlmCallsPerDay],
      DEFAULT_AGENT_LIMITS.maxLlmCallsPerDay,
      1,
      100_000
    ),
    dailyBudgetUsd: parsePositiveFloat(
      env[AGENT_LIMIT_ENV.dailyBudgetUsd],
      DEFAULT_AGENT_LIMITS.dailyBudgetUsd,
      0,
      1_000_000
    ),
    monthlyBudgetUsd: parsePositiveFloat(
      env[AGENT_LIMIT_ENV.monthlyBudgetUsd],
      DEFAULT_AGENT_LIMITS.monthlyBudgetUsd,
      0,
      10_000_000
    ),
    maxConcurrentExecutions: parsePositiveInt(
      env[AGENT_LIMIT_ENV.maxConcurrentExecutions],
      DEFAULT_AGENT_LIMITS.maxConcurrentExecutions,
      1,
      100
    ),
    maxCandidateBatchSize: parsePositiveInt(
      env[AGENT_LIMIT_ENV.maxCandidateBatchSize],
      DEFAULT_AGENT_LIMITS.maxCandidateBatchSize,
      1,
      100
    ),
    maxChainDepth: parsePositiveInt(
      env[AGENT_LIMIT_ENV.maxChainDepth],
      DEFAULT_AGENT_LIMITS.maxChainDepth,
      1,
      50
    ),
    maxPromptChars: parsePositiveInt(
      env[AGENT_LIMIT_ENV.maxPromptChars],
      DEFAULT_AGENT_LIMITS.maxPromptChars,
      1_000,
      200_000
    ),
    maxOutputChars: parsePositiveInt(
      env[AGENT_LIMIT_ENV.maxOutputChars],
      DEFAULT_AGENT_LIMITS.maxOutputChars,
      500,
      100_000
    ),
    maxAutomaticRetries: resolveAgentMaxAttempts(env),
    featureEnabled: parseFeatureEnabled(
      env[AGENT_LIMIT_ENV.featureEnabled],
      DEFAULT_AGENT_LIMITS.featureEnabled
    )
  };

  if (!overrides) {
    return base;
  }

  return { ...base, ...overrides };
}

/**
 * Apply Phase 4.12 resolved policy flat values onto safety limits.
 * Org DB policy wins for operational limits; autonomy remains enforced elsewhere.
 */
export function applyResolvedPolicyToSafetyLimits(
  limits: AgentSafetyLimits,
  flat: Record<string, unknown> | null | undefined
): AgentSafetyLimits {
  if (!flat) {
    return limits;
  }

  return {
    ...limits,
    maxExecutionsPerHour:
      typeof flat.max_agent_executions_per_hour === "number"
        ? flat.max_agent_executions_per_hour
        : limits.maxExecutionsPerHour,
    maxLlmCallsPerDay:
      typeof flat.max_llm_calls_per_day === "number"
        ? flat.max_llm_calls_per_day
        : limits.maxLlmCallsPerDay,
    dailyBudgetUsd:
      typeof flat.daily_budget_usd === "number"
        ? flat.daily_budget_usd
        : limits.dailyBudgetUsd,
    monthlyBudgetUsd:
      typeof flat.monthly_budget_usd === "number"
        ? flat.monthly_budget_usd
        : limits.monthlyBudgetUsd,
    maxConcurrentExecutions:
      typeof flat.max_concurrent_executions === "number"
        ? flat.max_concurrent_executions
        : limits.maxConcurrentExecutions,
    maxCandidateBatchSize:
      typeof flat.max_candidate_batch_size === "number"
        ? flat.max_candidate_batch_size
        : limits.maxCandidateBatchSize,
    maxChainDepth:
      typeof flat.max_chain_depth === "number"
        ? flat.max_chain_depth
        : limits.maxChainDepth,
    maxAutomaticRetries:
      typeof flat.max_retry_attempts === "number"
        ? flat.max_retry_attempts
        : limits.maxAutomaticRetries,
    featureEnabled:
      typeof flat.automated_worker_enabled === "boolean"
        ? flat.automated_worker_enabled
        : limits.featureEnabled
  };
}

export function resolveAgentMaxCandidateBatchSize(
  env: NodeJS.ProcessEnv = process.env
): number {
  return resolveAgentSafetyLimits(env).maxCandidateBatchSize;
}

export function resolveAgentMaxChainDepth(
  env: NodeJS.ProcessEnv = process.env
): number {
  return resolveAgentSafetyLimits(env).maxChainDepth;
}
