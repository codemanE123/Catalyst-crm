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
  }
): Promise<ProspectOutreachDraftResult> {
  const env = options?.env ?? process.env;
  const status = getProspectOutreachDraftStatus(env);

  if (!status.enabled) {
    return {
      ok: false,
      status: "disabled",
      reason: status.reason
    };
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
    fetchJson: options?.fetchJson
  });

  try {
    const providerResult = await provider.generateDraft(sanitizedInput);

    if (!providerResult.ok) {
      return providerResult;
    }

    const validatedOutput = validateProspectOutreachDraftOutput(providerResult.data);

    if (!validatedOutput.ok) {
      return {
        ok: false,
        status: "validation_failed",
        reason: validatedOutput.error
      };
    }

    return {
      ok: true,
      status: "draft_ready",
      data: validatedOutput.data,
      provider: "openai",
      model: providerResult.model,
      prompt_version: PROSPECT_OUTREACH_DRAFT_PROMPT_VERSION,
      usage: providerResult.usage
    };
  } catch {
    return {
      ok: false,
      status: "provider_error",
      reason: "Could not generate a prospect outreach draft with OpenAI."
    };
  }
}
