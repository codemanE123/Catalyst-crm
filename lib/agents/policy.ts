import { resolveAgentSafetyLimits, type AgentSafetyLimits } from "./limits";

export const AGENT_POLICY_REASON_CODES = [
  "feature_disabled",
  "hourly_execution_limit",
  "daily_llm_limit",
  "daily_budget_limit",
  "monthly_budget_limit",
  "concurrency_limit",
  "invalid_configuration",
  "chain_depth_exceeded",
  "candidate_batch_limit"
] as const;

export type AgentPolicyReasonCode = (typeof AGENT_POLICY_REASON_CODES)[number];

export type AgentPolicyDecision =
  | {
      allowed: true;
      reason_code: null;
      user_safe_message: null;
    }
  | {
      allowed: false;
      reason_code: AgentPolicyReasonCode;
      user_safe_message: string;
    };

export const POLICY_USER_SAFE_MESSAGES: Record<AgentPolicyReasonCode, string> = {
  feature_disabled: "This agent action is temporarily unavailable.",
  hourly_execution_limit:
    "Too many agent jobs were started recently. Try again later.",
  daily_llm_limit: "Daily AI usage limit reached.",
  daily_budget_limit: "Organization AI budget limit reached.",
  monthly_budget_limit: "Organization AI budget limit reached.",
  concurrency_limit: "Too many agent jobs are currently running.",
  invalid_configuration: "This agent action is temporarily unavailable.",
  chain_depth_exceeded: "This agent action is temporarily unavailable.",
  candidate_batch_limit: "Requested candidate batch exceeds the allowed size."
};

export function denyAgentPolicy(
  reasonCode: AgentPolicyReasonCode
): AgentPolicyDecision {
  return {
    allowed: false,
    reason_code: reasonCode,
    user_safe_message: POLICY_USER_SAFE_MESSAGES[reasonCode]
  };
}

export function allowAgentPolicy(): AgentPolicyDecision {
  return {
    allowed: true,
    reason_code: null,
    user_safe_message: null
  };
}

export function isBudgetOrRateLimitReason(
  reasonCode: AgentPolicyReasonCode | null | undefined
): boolean {
  return (
    reasonCode === "hourly_execution_limit" ||
    reasonCode === "daily_llm_limit" ||
    reasonCode === "daily_budget_limit" ||
    reasonCode === "monthly_budget_limit" ||
    reasonCode === "concurrency_limit"
  );
}

export type AgentUsageSnapshot = {
  executionsLastHour: number;
  runningCount: number;
  llmCallsToday: number;
  estimatedSpendTodayUsd: number;
  estimatedSpendMonthUsd: number;
};

export type EvaluateAgentPolicyInput = {
  usage: AgentUsageSnapshot;
  chainDepth?: number;
  candidateBatchSize?: number;
  checkLlmBudget?: boolean;
  env?: NodeJS.ProcessEnv;
  limits?: AgentSafetyLimits;
};

export function evaluateAgentPolicy(
  input: EvaluateAgentPolicyInput
): AgentPolicyDecision {
  const limits = input.limits ?? resolveAgentSafetyLimits(input.env);

  if (!limits.featureEnabled) {
    return denyAgentPolicy("feature_disabled");
  }

  if (
    input.chainDepth != null &&
    input.chainDepth > limits.maxChainDepth
  ) {
    return denyAgentPolicy("chain_depth_exceeded");
  }

  if (
    input.candidateBatchSize != null &&
    input.candidateBatchSize > limits.maxCandidateBatchSize
  ) {
    return denyAgentPolicy("candidate_batch_limit");
  }

  if (input.usage.executionsLastHour >= limits.maxExecutionsPerHour) {
    return denyAgentPolicy("hourly_execution_limit");
  }

  if (input.usage.runningCount > limits.maxConcurrentExecutions) {
    return denyAgentPolicy("concurrency_limit");
  }

  if (input.checkLlmBudget !== false) {
    if (input.usage.llmCallsToday >= limits.maxLlmCallsPerDay) {
      return denyAgentPolicy("daily_llm_limit");
    }

    if (input.usage.estimatedSpendTodayUsd >= limits.dailyBudgetUsd) {
      return denyAgentPolicy("daily_budget_limit");
    }

    if (input.usage.estimatedSpendMonthUsd >= limits.monthlyBudgetUsd) {
      return denyAgentPolicy("monthly_budget_limit");
    }
  }

  return allowAgentPolicy();
}

export function evaluateLlmCallPolicy(
  input: Omit<EvaluateAgentPolicyInput, "checkLlmBudget" | "chainDepth" | "candidateBatchSize">
): AgentPolicyDecision {
  const limits = input.limits ?? resolveAgentSafetyLimits(input.env);

  if (!limits.featureEnabled) {
    return denyAgentPolicy("feature_disabled");
  }

  if (input.usage.llmCallsToday >= limits.maxLlmCallsPerDay) {
    return denyAgentPolicy("daily_llm_limit");
  }

  if (input.usage.estimatedSpendTodayUsd >= limits.dailyBudgetUsd) {
    return denyAgentPolicy("daily_budget_limit");
  }

  if (input.usage.estimatedSpendMonthUsd >= limits.monthlyBudgetUsd) {
    return denyAgentPolicy("monthly_budget_limit");
  }

  return allowAgentPolicy();
}

export function auditActionForPolicyDenial(
  reasonCode: AgentPolicyReasonCode
): "agent.policy_denied" | "agent.usage_limit_reached" | "agent.budget_limit_reached" | "agent.chain_depth_exceeded" {
  if (reasonCode === "chain_depth_exceeded") {
    return "agent.chain_depth_exceeded";
  }

  if (
    reasonCode === "daily_budget_limit" ||
    reasonCode === "monthly_budget_limit"
  ) {
    return "agent.budget_limit_reached";
  }

  if (
    reasonCode === "hourly_execution_limit" ||
    reasonCode === "daily_llm_limit" ||
    reasonCode === "concurrency_limit"
  ) {
    return "agent.usage_limit_reached";
  }

  return "agent.policy_denied";
}
