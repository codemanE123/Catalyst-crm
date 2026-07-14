/**
 * Centralized OpenAI (and future provider) model pricing for estimated cost only.
 * Amounts are USD per 1M tokens. Update this table when provider list prices change.
 * Unknown models return null cost — never invent pricing.
 */

export type ModelTokenPricing = {
  inputUsdPer1MTokens: number;
  outputUsdPer1MTokens: number;
};

/**
 * Snapshot of public list prices (USD / 1M tokens). Easy to revise in one place.
 * Source of truth for estimated_cost_usd on agent_usage_events.
 */
export const MODEL_PRICING_USD_PER_1M_TOKENS: Record<string, ModelTokenPricing> = {
  "gpt-4o-mini": {
    inputUsdPer1MTokens: 0.15,
    outputUsdPer1MTokens: 0.6
  },
  "gpt-4o": {
    inputUsdPer1MTokens: 2.5,
    outputUsdPer1MTokens: 10
  },
  "gpt-4.1-mini": {
    inputUsdPer1MTokens: 0.4,
    outputUsdPer1MTokens: 1.6
  },
  "gpt-4.1": {
    inputUsdPer1MTokens: 2,
    outputUsdPer1MTokens: 8
  }
};

export function normalizeModelPricingKey(model: string | null | undefined): string | null {
  if (!model?.trim()) {
    return null;
  }

  return model.trim().toLowerCase();
}

export function getModelPricing(
  model: string | null | undefined
): ModelTokenPricing | null {
  const key = normalizeModelPricingKey(model);

  if (!key) {
    return null;
  }

  return MODEL_PRICING_USD_PER_1M_TOKENS[key] ?? null;
}

export function estimateLlmCostUsd(input: {
  model: string | null | undefined;
  inputTokens: number | null | undefined;
  outputTokens: number | null | undefined;
}): number | null {
  const pricing = getModelPricing(input.model);

  if (!pricing) {
    return null;
  }

  if (
    input.inputTokens == null ||
    input.outputTokens == null ||
    !Number.isFinite(input.inputTokens) ||
    !Number.isFinite(input.outputTokens) ||
    input.inputTokens < 0 ||
    input.outputTokens < 0
  ) {
    return null;
  }

  const cost =
    (input.inputTokens / 1_000_000) * pricing.inputUsdPer1MTokens +
    (input.outputTokens / 1_000_000) * pricing.outputUsdPer1MTokens;

  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function sumTokenCounts(
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined
): number | null {
  if (inputTokens == null || outputTokens == null) {
    return null;
  }

  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) {
    return null;
  }

  return inputTokens + outputTokens;
}
