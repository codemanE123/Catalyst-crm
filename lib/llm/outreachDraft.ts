import type { AgentUsageStore } from "@/lib/agents/usage";
import { recordLlmUsageEvent, startOfUtcMonth } from "@/lib/agents/usage";
import { evaluateLlmCallPolicy } from "@/lib/agents/policy";
import { enforcePromptInputSize } from "@/lib/agents/safety";
import { startOfUtcDay } from "@/lib/agentOperations";

import { estimateLlmCostUsd } from "./pricing";
import {
  productionMetadataFromContext,
  type LlmProductionContext
} from "./productionContext";
import { createOpenAiOutreachDraftProvider } from "./outreachDraftProvider";
import {
  containsUnresolvedPiiInValue,
  findOutreachDraftForbiddenInputKeys,
  getOpenAiApiKeyFromEnv,
  getProspectOutreachDraftDisabledReason,
  isProspectOutreachDraftEnabledInEnv,
  PROSPECT_OUTREACH_DRAFT_PROMPT_VERSION,
  sanitizeProspectOutreachDraftInput,
  validateProspectOutreachDraftInput,
  validateProspectOutreachDraftOutput,
  type ProspectOutreachDraftRequest,
  type ProspectOutreachDraftResult
} from "./outreachDraftTypes";

export {
  prospectOutreachDraftInputSchema,
  prospectOutreachDraftOutputSchema,
  PROSPECT_OUTREACH_DRAFT_PROMPT_VERSION,
  PROSPECT_OUTREACH_DRAFT_REVIEW_WARNING,
  sanitizeProspectOutreachDraftInput,
  validateProspectOutreachDraftInput,
  validateProspectOutreachDraftOutput,
  getProspectOutreachDraftDisabledReason,
  isProspectOutreachDraftEnabledInEnv
} from "./outreachDraftTypes";

export {
  buildProspectOutreachDraftMessages,
  createOpenAiOutreachDraftProvider
} from "./outreachDraftProvider";

export function getProspectOutreachDraftStatus(env: NodeJS.ProcessEnv = process.env): {
  enabled: boolean;
  reason: string;
} {
  const enabled = isProspectOutreachDraftEnabledInEnv(env);

  return {
    enabled,
    reason: enabled
      ? "AI outreach drafts are enabled."
      : getProspectOutreachDraftDisabledReason(env)
  };
}

export async function generateProspectOutreachDraftWithLlm(
  request: ProspectOutreachDraftRequest,
  options?: {
    env?: NodeJS.ProcessEnv;
    fetchJson?: Parameters<typeof createOpenAiOutreachDraftProvider>[0]["fetchJson"];
    usageStore?: AgentUsageStore;
    agentExecutionId?: string | null;
    agentName?: string | null;
    productionContext?: LlmProductionContext;
  }
): Promise<ProspectOutreachDraftResult> {
  const env = options?.env ?? process.env;
  const status = getProspectOutreachDraftStatus(env);
  const agentName = options?.agentName ?? "OutreachDraftAgent";

  if (!status.enabled) {
    return {
      ok: false,
      status: "disabled",
      reason: status.reason
    };
  }

  const limits = options?.productionContext?.limits;
  const model = options?.productionContext?.model;

  if (options?.usageStore && !options.productionContext) {
    const [llmCallsToday, spendToday, spendMonth] = await Promise.all([
      options.usageStore.countLlmCallsSince(
        request.context.organization_id,
        startOfUtcDay()
      ),
      options.usageStore.sumEstimatedCostSince(
        request.context.organization_id,
        startOfUtcDay()
      ),
      options.usageStore.sumEstimatedCostSince(
        request.context.organization_id,
        startOfUtcMonth()
      )
    ]);

    const policy = evaluateLlmCallPolicy({
      usage: {
        executionsLastHour: 0,
        runningCount: 0,
        llmCallsToday,
        estimatedSpendTodayUsd: spendToday,
        estimatedSpendMonthUsd: spendMonth
      },
      env,
      limits
    });

    if (!policy.allowed) {
      await recordLlmUsageEvent(options.usageStore, {
        organizationId: request.context.organization_id,
        agentExecutionId: options.agentExecutionId,
        agentName,
        targetType: "prospect_candidate",
        targetId: request.context.candidate_id,
        status: "denied",
        denialReasonCode: policy.reason_code
      });

      return {
        ok: false,
        status: "disabled",
        reason: policy.user_safe_message
      };
    }
  }

  const forbiddenKeys = findOutreachDraftForbiddenInputKeys(request);

  if (forbiddenKeys.length > 0) {
    return {
      ok: false,
      status: "blocked",
      reason: "Prospect outreach draft input contains forbidden private CRM fields.",
      block_reason: "forbidden_field"
    };
  }

  const validatedInput = validateProspectOutreachDraftInput(request.input);

  if (!validatedInput.ok) {
    return {
      ok: false,
      status: "blocked",
      reason: validatedInput.error,
      block_reason: "invalid_input"
    };
  }

  const sanitizedInput = sanitizeProspectOutreachDraftInput(validatedInput.input);
  const promptSize = enforcePromptInputSize(JSON.stringify(sanitizedInput), env);

  if (!promptSize.ok) {
    return {
      ok: false,
      status: "blocked",
      reason: promptSize.error,
      block_reason: "invalid_input"
    };
  }

  if (containsUnresolvedPiiInValue(sanitizedInput)) {
    return {
      ok: false,
      status: "blocked",
      reason: "Prospect outreach draft input contains personal contact information.",
      block_reason: "pii_detected"
    };
  }

  const apiKey = getOpenAiApiKeyFromEnv(env);

  if (!apiKey) {
    return {
      ok: false,
      status: "disabled",
      reason: getProspectOutreachDraftDisabledReason(env)
    };
  }

  const provider = createOpenAiOutreachDraftProvider({
    apiKey,
    model,
    fetchJson: options?.fetchJson
  });

  const meta = options?.productionContext
    ? productionMetadataFromContext(options.productionContext)
    : null;

  try {
    const providerResult = await provider.generateDraft(sanitizedInput);

    if (!providerResult.ok) {
      if (options?.usageStore) {
        await recordLlmUsageEvent(options.usageStore, {
          organizationId: request.context.organization_id,
          agentExecutionId: options.agentExecutionId,
          agentName,
          targetType: "prospect_candidate",
          targetId: request.context.candidate_id,
          provider: "openai",
          model: provider.model,
          status: "failed"
        });
      }

      return providerResult;
    }

    const validatedOutput = validateProspectOutreachDraftOutput(providerResult.data);

    if (!validatedOutput.ok) {
      if (options?.usageStore) {
        await recordLlmUsageEvent(options.usageStore, {
          organizationId: request.context.organization_id,
          agentExecutionId: options.agentExecutionId,
          agentName,
          targetType: "prospect_candidate",
          targetId: request.context.candidate_id,
          provider: providerResult.provider,
          model: providerResult.model,
          inputTokens: providerResult.usage.input_tokens,
          outputTokens: providerResult.usage.output_tokens,
          status: "failed"
        });
      }

      return {
        ok: false,
        status: "validation_failed",
        reason: validatedOutput.error
      };
    }

    const estimatedCost = estimateLlmCostUsd({
      model: providerResult.model,
      inputTokens: providerResult.usage.input_tokens,
      outputTokens: providerResult.usage.output_tokens
    });

    if (options?.usageStore) {
      await recordLlmUsageEvent(options.usageStore, {
        organizationId: request.context.organization_id,
        agentExecutionId: options.agentExecutionId,
        agentName,
        targetType: "prospect_candidate",
        targetId: request.context.candidate_id,
        provider: providerResult.provider,
        model: providerResult.model,
        inputTokens: providerResult.usage.input_tokens,
        outputTokens: providerResult.usage.output_tokens,
        status: "success"
      });
    }

    return {
      ok: true,
      status: "draft_ready",
      data: validatedOutput.data,
      provider: "openai",
      model: providerResult.model,
      prompt_version:
        meta?.prompt_version ?? PROSPECT_OUTREACH_DRAFT_PROMPT_VERSION,
      prompt_version_id: meta?.prompt_version_id ?? null,
      policy_set_id: meta?.policy_set_id ?? null,
      policy_version: meta?.policy_version ?? null,
      rollout_id: meta?.rollout_id ?? null,
      experiment_variant: meta?.experiment_variant ?? null,
      estimated_cost_usd: estimatedCost,
      usage: providerResult.usage
    };
  } catch {
    if (options?.usageStore) {
      await recordLlmUsageEvent(options.usageStore, {
        organizationId: request.context.organization_id,
        agentExecutionId: options.agentExecutionId,
        agentName,
        targetType: "prospect_candidate",
        targetId: request.context.candidate_id,
        provider: "openai",
        status: "failed"
      });
    }

    return {
      ok: false,
      status: "provider_error",
      reason: "Could not generate a prospect outreach draft with OpenAI."
    };
  }
}
