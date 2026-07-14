export const AGENT_FAILURE_CLASSES = [
  "transient",
  "permanent",
  "cancelled",
  "configuration"
] as const;

export type AgentFailureClass = (typeof AGENT_FAILURE_CLASSES)[number];

const PERMANENT_PATTERNS = [
  /not found/i,
  /validation/i,
  /invalid/i,
  /permission/i,
  /not authorized/i,
  /unauthorized/i,
  /forbidden/i,
  /cancelled by user/i,
  /only failed agent executions/i,
  /requires target_type/i,
  /daily ai usage limit/i,
  /ai budget limit/i,
  /too many agent jobs/i,
  /temporarily unavailable/i,
  /candidate batch/i,
  /circular agent dependency/i,
  /not certified/i,
  /readiness certification/i
];

const CONFIGURATION_PATTERNS = [
  /not configured/i,
  /api key/i,
  /openai_api_key/i,
  /llm.*disabled/i,
  /enrichment is disabled/i,
  /is not implemented yet/i,
  /is not registered/i,
  /missing.*env/i
];

const CANCELLED_PATTERNS = [/cancelled/i];

export function classifyAgentFailure(
  errorMessage: string | null | undefined,
  errorCode?: string | null
): AgentFailureClass {
  const code = (errorCode ?? "").toLowerCase();
  const message = errorMessage ?? "";

  if (code === "cancelled" || CANCELLED_PATTERNS.some((pattern) => pattern.test(message))) {
    return "cancelled";
  }

  if (
    code === "configuration" ||
    CONFIGURATION_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    return "configuration";
  }

  if (
    code === "permanent" ||
    code === "validation" ||
    code === "authorization" ||
    code === "policy" ||
    code === "feature_disabled" ||
    code === "hourly_execution_limit" ||
    code === "daily_llm_limit" ||
    code === "daily_budget_limit" ||
    code === "monthly_budget_limit" ||
    code === "concurrency_limit" ||
    code === "chain_depth_exceeded" ||
    code === "candidate_batch_limit" ||
    code === "invalid_configuration" ||
    code === "certification_denied" ||
    code === "model_not_approved" ||
    code === "provider_disabled" ||
    code === "human_review_required_disabled" ||
    PERMANENT_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    return "permanent";
  }

  return "transient";
}

export function isRetriableFailureClass(failureClass: AgentFailureClass): boolean {
  return failureClass === "transient";
}
