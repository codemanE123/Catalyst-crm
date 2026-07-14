import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applyResolvedPolicyToSafetyLimits,
  resolveAgentSafetyLimits,
  type AgentSafetyLimits
} from "@/lib/agents/limits";
import { evaluateLlmCallPolicy, type AgentPolicyDecision } from "@/lib/agents/policy";
import {
  resolveAgentPolicyFromSupabase
} from "@/lib/agents/policies/supabase";
import {
  stampFromResolvedPolicy,
  type PolicyExecutionStamp,
  type ResolvedAgentPolicy
} from "@/lib/agents/policies";
import {
  resolvePromptStampFromSupabase
} from "@/lib/agents/prompts/supabase";
import type { PromptExecutionStamp } from "@/lib/agents/prompts";
import {
  isCertificationValidForExecution,
  resolveAgentReadinessConfig,
  type AgentReadinessCertification
} from "@/lib/agents/readiness";
import {
  findValidCertification,
  resolveReadinessEnvironment
} from "@/lib/agents/readiness/supabase";
import type { AgentName } from "@/lib/agents/types";
import type { AgentUsageStore } from "@/lib/agents/usage";
import { startOfUtcDay } from "@/lib/agentOperations";
import { startOfUtcMonth } from "@/lib/agents/usage";

import { DEFAULT_OPENAI_ENRICHMENT_MODEL } from "./openaiProvider";

export const APPROVED_OPENAI_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini"
] as const;

export type ApprovedOpenAiModel = (typeof APPROVED_OPENAI_MODELS)[number];

export type LlmProductionGateReasonCode =
  | "feature_disabled"
  | "provider_disabled"
  | "model_not_approved"
  | "certification_denied"
  | "daily_llm_limit"
  | "daily_budget_limit"
  | "monthly_budget_limit"
  | "chain_depth_exceeded"
  | "human_review_required_disabled";

export type LlmProductionContext = {
  agentName: AgentName;
  model: ApprovedOpenAiModel;
  limits: AgentSafetyLimits;
  policy: ResolvedAgentPolicy | null;
  policyStamp: PolicyExecutionStamp | null;
  promptStamp: PromptExecutionStamp | null;
  certification: AgentReadinessCertification | null;
  chainDepth: number;
};

export type LlmProductionGateResult =
  | { ok: true; context: LlmProductionContext }
  | {
      ok: false;
      reason: string;
      reason_code: LlmProductionGateReasonCode;
      user_safe_message: string;
    };

const USER_SAFE: Record<LlmProductionGateReasonCode, string> = {
  feature_disabled: "This agent action is temporarily unavailable.",
  provider_disabled: "The LLM provider is disabled by organization policy.",
  model_not_approved:
    "The configured LLM model is not approved for production use.",
  certification_denied:
    "This agent is not certified for the current environment. Contact an administrator.",
  daily_llm_limit: "Daily AI usage limit reached.",
  daily_budget_limit: "Organization AI budget limit reached.",
  monthly_budget_limit: "Organization AI budget limit reached.",
  chain_depth_exceeded: "This agent action is temporarily unavailable.",
  human_review_required_disabled:
    "Human review requirements must remain enabled before LLM drafts can run."
};

export function isApprovedOpenAiModel(model: string): model is ApprovedOpenAiModel {
  return (APPROVED_OPENAI_MODELS as readonly string[]).includes(model);
}

export function resolveApprovedModelFromPolicy(
  flat: Record<string, unknown> | null | undefined,
  promptStamp?: PromptExecutionStamp | null
): ApprovedOpenAiModel | null {
  const promptModel = promptStamp?.model;
  if (promptModel) {
    return isApprovedOpenAiModel(promptModel) ? promptModel : null;
  }

  const policyModel =
    typeof flat?.default_model === "string" ? flat.default_model : null;
  if (policyModel) {
    return isApprovedOpenAiModel(policyModel) ? policyModel : null;
  }

  return DEFAULT_OPENAI_ENRICHMENT_MODEL;
}

/**
 * Evaluate production gates for an OpenAI LLM call without creating a second
 * provider framework. Pure enough for unit tests with injected snapshots.
 */
export function evaluateLlmProductionGates(params: {
  agentName: AgentName;
  env?: NodeJS.ProcessEnv;
  usage: {
    llmCallsToday: number;
    estimatedSpendTodayUsd: number;
    estimatedSpendMonthUsd: number;
  };
  policyFlat?: Record<string, unknown> | null;
  policy?: ResolvedAgentPolicy | null;
  policyStamp?: PolicyExecutionStamp | null;
  promptStamp?: PromptExecutionStamp | null;
  certification?: AgentReadinessCertification | null;
  chainDepth?: number;
  skipReadinessCheck?: boolean;
}): LlmProductionGateResult {
  const env = params.env ?? process.env;
  const limits = applyResolvedPolicyToSafetyLimits(
    resolveAgentSafetyLimits(env),
    params.policyFlat ?? params.policy?.flat ?? null
  );

  if (!limits.featureEnabled) {
    return deny("feature_disabled");
  }

  const provider =
    typeof (params.policyFlat ?? params.policy?.flat)?.default_provider === "string"
      ? String((params.policyFlat ?? params.policy?.flat)?.default_provider)
      : "openai";

  if (provider === "none") {
    return deny("provider_disabled");
  }

  const model = resolveApprovedModelFromPolicy(
    params.policyFlat ?? params.policy?.flat ?? null,
    params.promptStamp
  );

  if (!model) {
    return deny("model_not_approved");
  }

  const flat = params.policyFlat ?? params.policy?.flat ?? null;
  if (flat) {
    if (
      params.agentName === "ProspectEnrichmentAgent" &&
      flat.require_prospect_approval === false
    ) {
      return deny("human_review_required_disabled");
    }
    if (
      params.agentName === "OutreachDraftAgent" &&
      flat.require_outreach_review === false
    ) {
      return deny("human_review_required_disabled");
    }
  }

  const chainDepth = params.chainDepth ?? 0;
  if (chainDepth > limits.maxChainDepth) {
    return deny("chain_depth_exceeded");
  }

  if (!params.skipReadinessCheck) {
    const readiness = resolveAgentReadinessConfig(env);
    const environment = resolveReadinessEnvironment(env);
    const required =
      readiness.enabled &&
      ((environment === "production" && readiness.productionRequired) ||
        (environment === "staging" && readiness.stagingRequired));

    if (required) {
      const cert = params.certification ?? null;
      if (!isCertificationValidForExecution(cert)) {
        return deny("certification_denied");
      }
    }
  }

  const budgetPolicy: AgentPolicyDecision = evaluateLlmCallPolicy({
    usage: {
      executionsLastHour: 0,
      runningCount: 0,
      llmCallsToday: params.usage.llmCallsToday,
      estimatedSpendTodayUsd: params.usage.estimatedSpendTodayUsd,
      estimatedSpendMonthUsd: params.usage.estimatedSpendMonthUsd
    },
    env,
    limits
  });

  if (!budgetPolicy.allowed) {
    const code = budgetPolicy.reason_code as LlmProductionGateReasonCode;
    return {
      ok: false,
      reason_code: code,
      reason: budgetPolicy.user_safe_message,
      user_safe_message: budgetPolicy.user_safe_message
    };
  }

  return {
    ok: true,
    context: {
      agentName: params.agentName,
      model,
      limits,
      policy: params.policy ?? null,
      policyStamp: params.policyStamp ?? null,
      promptStamp: params.promptStamp ?? null,
      certification: params.certification ?? null,
      chainDepth
    }
  };
}

function deny(code: LlmProductionGateReasonCode): LlmProductionGateResult {
  return {
    ok: false,
    reason_code: code,
    reason: USER_SAFE[code],
    user_safe_message: USER_SAFE[code]
  };
}

export async function resolveLlmProductionContextFromSupabase(params: {
  supabase: SupabaseClient;
  organizationId: string;
  agentName: AgentName;
  actorUserId: string;
  targetId: string;
  usageStore: AgentUsageStore;
  chainDepth?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<LlmProductionGateResult> {
  const env = params.env ?? process.env;

  const [policy, promptStamp, certification, llmCallsToday, spendToday, spendMonth] =
    await Promise.all([
      resolveAgentPolicyFromSupabase({
        supabase: params.supabase,
        organizationId: params.organizationId,
        env
      }),
      resolvePromptStampFromSupabase({
        supabase: params.supabase,
        agentName: params.agentName,
        organizationId: params.organizationId,
        userId: params.actorUserId,
        targetId: params.targetId
      }),
      findValidCertification({
        supabase: params.supabase,
        organizationId: params.organizationId,
        agentName: params.agentName,
        environment: resolveReadinessEnvironment(env)
      }),
      params.usageStore.countLlmCallsSince(params.organizationId, startOfUtcDay()),
      params.usageStore.sumEstimatedCostSince(params.organizationId, startOfUtcDay()),
      params.usageStore.sumEstimatedCostSince(params.organizationId, startOfUtcMonth())
    ]);

  return evaluateLlmProductionGates({
    agentName: params.agentName,
    env,
    usage: {
      llmCallsToday,
      estimatedSpendTodayUsd: spendToday,
      estimatedSpendMonthUsd: spendMonth
    },
    policy,
    policyFlat: policy.flat,
    policyStamp: stampFromResolvedPolicy(policy),
    promptStamp,
    certification,
    chainDepth: params.chainDepth ?? 0
  });
}

export function productionMetadataFromContext(context: LlmProductionContext): {
  prompt_version: string | null;
  prompt_version_id: string | null;
  prompt_key: string | null;
  rollout_id: string | null;
  experiment_variant: string | null;
  policy_set_id: string | null;
  policy_version: string | null;
  policy_scope: string | null;
  model: string;
  certification_id: string | null;
} {
  return {
    prompt_version:
      context.promptStamp?.prompt_version ??
      context.promptStamp?.prompt_key ??
      null,
    prompt_version_id: context.promptStamp?.prompt_version_id ?? null,
    prompt_key: context.promptStamp?.prompt_key ?? null,
    rollout_id: context.promptStamp?.rollout_id ?? null,
    experiment_variant: context.promptStamp?.experiment_variant ?? null,
    policy_set_id: context.policyStamp?.policy_set_id ?? null,
    policy_version: context.policyStamp?.policy_version ?? null,
    policy_scope: context.policyStamp?.policy_scope ?? null,
    model: context.model,
    certification_id: context.certification?.id ?? null
  };
}
