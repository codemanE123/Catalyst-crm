import { createOpenAiProvider } from "./openaiProvider";
import {
  findForbiddenInputKeys,
  getLlmEnrichmentDisabledReason,
  isLlmEnrichmentEnabledInEnv,
  sanitizeProspectEnrichmentInput,
  validateProspectEnrichmentInput,
  validateProspectEnrichmentOutput,
  type LlmEnrichmentResult,
  type ProspectEnrichmentRequest,
  PROSPECT_ENRICHMENT_PROMPT_VERSION,
  getOpenAiApiKeyFromEnv,
  containsUnresolvedPiiInValue
} from "./types";
import type { AgentUsageStore } from "@/lib/agents/usage";
import { recordLlmUsageEvent } from "@/lib/agents/usage";
import { evaluateLlmCallPolicy } from "@/lib/agents/policy";
import { startOfUtcDay } from "@/lib/agentOperations";
import { startOfUtcMonth } from "@/lib/agents/usage";
import { enforcePromptInputSize } from "@/lib/agents/safety";


export {
  extractWebsiteDomain,
  getLlmEnrichmentDisabledReason,
  getOpenAiApiKeyFromEnv,
  isLlmEnrichmentEnabledInEnv,
  prospectEnrichmentInputSchema,
  prospectEnrichmentOutputSchema,
  PROSPECT_ENRICHMENT_PROMPT_VERSION,
  sanitizeProspectEnrichmentInput,
  scrubPiiFromString,
  validateProspectEnrichmentInput,
  validateProspectEnrichmentOutput
} from "./types";

export { createOpenAiProvider } from "./openaiProvider";

export {
  estimateLlmCostUsd,
  getModelPricing,
  MODEL_PRICING_USD_PER_1M_TOKENS,
  sumTokenCounts
} from "./pricing";

export function getLlmEnrichmentStatus(env: NodeJS.ProcessEnv = process.env): {
  enabled: boolean;
  reason: string;
} {
  const enabled = isLlmEnrichmentEnabledInEnv(env);

  return {
    enabled,
    reason: enabled ? "LLM enrichment is enabled." : getLlmEnrichmentDisabledReason(env)
  };
}

export async function enrichProspectCandidate(
  request: ProspectEnrichmentRequest,
  options?: {
    env?: NodeJS.ProcessEnv;
    fetchJson?: Parameters<typeof createOpenAiProvider>[0]["fetchJson"];
    usageStore?: AgentUsageStore;
    agentExecutionId?: string | null;
    agentName?: string | null;
  }
): Promise<LlmEnrichmentResult> {
  const env = options?.env ?? process.env;
  const status = getLlmEnrichmentStatus(env);

  if (!status.enabled) {
    return {
      ok: false,
      status: "disabled",
      reason: status.reason
    };
  }

  if (options?.usageStore) {
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
      env
    });

    if (!policy.allowed) {
      await recordLlmUsageEvent(options.usageStore, {
        organizationId: request.context.organization_id,
        agentExecutionId: options.agentExecutionId,
        agentName: options.agentName ?? "ProspectEnrichmentAgent",
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

  const forbiddenKeys = findForbiddenInputKeys(request);

  if (forbiddenKeys.length > 0) {
    return {
      ok: false,
      status: "blocked",
      reason: "Prospect enrichment input contains forbidden private CRM fields.",
      block_reason: "forbidden_field"
    };
  }

  const validatedInput = validateProspectEnrichmentInput(request.input);

  if (!validatedInput.ok) {
    return {
      ok: false,
      status: "blocked",
      reason: validatedInput.error,
      block_reason: "invalid_input"
    };
  }

  const sanitizedInput = sanitizeProspectEnrichmentInput(validatedInput.input);
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
      reason: "Prospect enrichment input contains personal contact information.",
      block_reason: "pii_detected"
    };
  }

  const apiKey = getOpenAiApiKeyFromEnv(env);

  if (!apiKey) {
    return {
      ok: false,
      status: "disabled",
      reason: getLlmEnrichmentDisabledReason(env)
    };
  }

  const provider = createOpenAiProvider({
    apiKey,
    fetchJson: options?.fetchJson
  });

  try {
    const providerResult = await provider.enrich(sanitizedInput);

    if (!providerResult.ok) {
      if (options?.usageStore) {
        await recordLlmUsageEvent(options.usageStore, {
          organizationId: request.context.organization_id,
          agentExecutionId: options.agentExecutionId,
          agentName: options.agentName ?? "ProspectEnrichmentAgent",
          targetType: "prospect_candidate",
          targetId: request.context.candidate_id,
          provider: "openai",
          model: provider.model,
          status: "failed"
        });
      }

      return providerResult;
    }

    const validatedOutput = validateProspectEnrichmentOutput(providerResult.data);

    if (!validatedOutput.ok) {
      if (options?.usageStore) {
        await recordLlmUsageEvent(options.usageStore, {
          organizationId: request.context.organization_id,
          agentExecutionId: options.agentExecutionId,
          agentName: options.agentName ?? "ProspectEnrichmentAgent",
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

    if (options?.usageStore) {
      await recordLlmUsageEvent(options.usageStore, {
        organizationId: request.context.organization_id,
        agentExecutionId: options.agentExecutionId,
        agentName: options.agentName ?? "ProspectEnrichmentAgent",
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
      status: "enriched",
      data: validatedOutput.data,
      provider: "openai",
      model: providerResult.model,
      prompt_version: PROSPECT_ENRICHMENT_PROMPT_VERSION,
      usage: providerResult.usage
    };
  } catch {
    if (options?.usageStore) {
      await recordLlmUsageEvent(options.usageStore, {
        organizationId: request.context.organization_id,
        agentExecutionId: options.agentExecutionId,
        agentName: options.agentName ?? "ProspectEnrichmentAgent",
        targetType: "prospect_candidate",
        targetId: request.context.candidate_id,
        provider: "openai",
        status: "failed"
      });
    }

    return {
      ok: false,
      status: "provider_error",
      reason: "Could not complete prospect enrichment with OpenAI."
    };
  }
}
