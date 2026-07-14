import { resolveAgentPolicyBootstrap } from "./defaults";
import type { ResolvedAgentPolicy } from "./types";

export type PolicyDriftFlag = {
  code:
    | "deprecated_policy_on_execution"
    | "organization_missing_active_policy"
    | "env_conflicts_with_db_policy"
    | "rollout_unavailable_provider"
    | "unsupported_prompt_model";
  severity: "info" | "warning" | "high";
  message: string;
  details?: Record<string, string | number | boolean | null>;
};

export function detectPolicyDrift(params: {
  resolved: ResolvedAgentPolicy;
  organizationHasActivePolicy: boolean;
  executionPolicySetIds?: Array<string | null>;
  activePolicySetId?: string | null;
  deprecatedPolicySetIds?: Set<string>;
  rolloutProvider?: string | null;
  rolloutModel?: string | null;
  supportedProviders?: string[];
  supportedModels?: string[];
  env?: NodeJS.ProcessEnv;
}): PolicyDriftFlag[] {
  const flags: PolicyDriftFlag[] = [];
  const bootstrap = resolveAgentPolicyBootstrap(params.env);

  if (
    params.resolved.organization_id &&
    !params.organizationHasActivePolicy
  ) {
    flags.push({
      code: "organization_missing_active_policy",
      severity: "info",
      message: "Organization has no active policy set; using global/system defaults."
    });
  }

  for (const id of params.executionPolicySetIds ?? []) {
    if (id && params.deprecatedPolicySetIds?.has(id)) {
      flags.push({
        code: "deprecated_policy_on_execution",
        severity: "warning",
        message: "Recent execution referenced a deprecated policy set.",
        details: { policy_set_id: id }
      });
    }
  }

  // Env bootstrap vs stricter DB: flag when env budget higher than resolved (DB won) or
  // env would prefer higher concurrency than resolved.
  if (
    typeof params.resolved.flat.daily_budget_usd === "number" &&
    bootstrap.defaultDailyBudgetUsd < Number(params.resolved.flat.daily_budget_usd)
  ) {
    // DB raised budget above bootstrap — operational note
    flags.push({
      code: "env_conflicts_with_db_policy",
      severity: "info",
      message:
        "Resolved daily budget differs from environment bootstrap default.",
      details: {
        env_daily_budget_usd: bootstrap.defaultDailyBudgetUsd,
        resolved_daily_budget_usd: Number(params.resolved.flat.daily_budget_usd)
      }
    });
  }

  if (
    typeof params.resolved.flat.max_concurrent_executions === "number" &&
    bootstrap.defaultMaxConcurrency !==
      Number(params.resolved.flat.max_concurrent_executions)
  ) {
    flags.push({
      code: "env_conflicts_with_db_policy",
      severity: "info",
      message:
        "Resolved concurrency differs from environment bootstrap default.",
      details: {
        env_max_concurrency: bootstrap.defaultMaxConcurrency,
        resolved_max_concurrency: Number(
          params.resolved.flat.max_concurrent_executions
        )
      }
    });
  }

  const providers = params.supportedProviders ?? ["openai", "none"];
  const models = params.supportedModels ?? [
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4.1-mini",
    "none"
  ];

  if (
    params.rolloutProvider &&
    !providers.includes(params.rolloutProvider)
  ) {
    flags.push({
      code: "rollout_unavailable_provider",
      severity: "high",
      message: "Rollout references an unavailable provider.",
      details: { provider: params.rolloutProvider }
    });
  }

  if (params.rolloutModel && !models.includes(params.rolloutModel)) {
    flags.push({
      code: "rollout_unavailable_provider",
      severity: "high",
      message: "Rollout references an unavailable model.",
      details: { model: params.rolloutModel }
    });
  }

  const policyModel = params.resolved.flat.default_model;
  if (
    typeof policyModel === "string" &&
    !models.includes(policyModel)
  ) {
    flags.push({
      code: "unsupported_prompt_model",
      severity: "high",
      message: "Policy default_model is unsupported.",
      details: { model: policyModel }
    });
  }

  return flags;
}
