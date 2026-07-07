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
      return providerResult;
    }

    const validatedOutput = validateProspectEnrichmentOutput(providerResult.data);

    if (!validatedOutput.ok) {
      return {
        ok: false,
        status: "validation_failed",
        reason: validatedOutput.error
      };
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
    return {
      ok: false,
      status: "provider_error",
      reason: "Could not complete prospect enrichment with OpenAI."
    };
  }
}
