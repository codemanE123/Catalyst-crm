import { z } from "zod";

import {
  containsUnresolvedPiiInValue,
  getLlmEnrichmentDisabledReason,
  getOpenAiApiKeyFromEnv,
  isLlmEnrichmentEnabledInEnv,
  scrubPiiFromString
} from "./types";

export const PROSPECT_OUTREACH_DRAFT_PROMPT_VERSION = "prospect.outreach_draft.v1";

export const prospectOutreachDraftInputSchema = z.object({
  organization_name: z.string().trim().min(1).max(200),
  website: z.string().trim().max(500).nullable(),
  city: z.string().trim().max(120).nullable(),
  state: z.string().trim().max(32).nullable(),
  school_types: z.array(z.string().trim().min(1).max(80)).min(1).max(5),
  fit_score: z.number().min(0).max(1).nullable(),
  confidence_score: z.number().min(0).max(1).nullable(),
  source_name: z.string().trim().max(200).nullable(),
  source_url: z.string().trim().url().max(500).nullable(),
  enrichment_summary: z.string().trim().max(800).nullable(),
  outreach_angle: z.string().trim().max(600).nullable(),
  recommended_next_step: z.string().trim().max(120).nullable()
});

export const prospectOutreachDraftOutputSchema = z.object({
  draft_text: z.string().trim().min(50).max(4000)
});

export type ProspectOutreachDraftInput = z.infer<
  typeof prospectOutreachDraftInputSchema
>;
export type ProspectOutreachDraftOutput = z.infer<
  typeof prospectOutreachDraftOutputSchema
>;

export type ProspectOutreachDraftContext = {
  organization_id: string;
  job_id: string;
  candidate_id: string;
};

export type ProspectOutreachDraftRequest = {
  input: ProspectOutreachDraftInput;
  context: ProspectOutreachDraftContext;
};

export type ProspectOutreachDraftDisabledResult = {
  ok: false;
  status: "disabled";
  reason: string;
};

export type ProspectOutreachDraftBlockedResult = {
  ok: false;
  status: "blocked";
  reason: string;
  block_reason: "pii_detected" | "forbidden_field" | "invalid_input";
};

export type ProspectOutreachDraftValidationFailedResult = {
  ok: false;
  status: "validation_failed";
  reason: string;
};

export type ProspectOutreachDraftProviderErrorResult = {
  ok: false;
  status: "provider_error";
  reason: string;
};

export type ProspectOutreachDraftSuccessResult = {
  ok: true;
  status: "draft_ready";
  data: ProspectOutreachDraftOutput;
  provider: "openai";
  model: string;
  prompt_version: string;
  prompt_version_id?: string | null;
  policy_set_id?: string | null;
  policy_version?: string | null;
  rollout_id?: string | null;
  experiment_variant?: string | null;
  estimated_cost_usd?: number | null;
  usage: {
    input_tokens: number | null;
    output_tokens: number | null;
  };
};

export type ProspectOutreachDraftResult =
  | ProspectOutreachDraftSuccessResult
  | ProspectOutreachDraftDisabledResult
  | ProspectOutreachDraftBlockedResult
  | ProspectOutreachDraftValidationFailedResult
  | ProspectOutreachDraftProviderErrorResult;

export const OUTREACH_DRAFT_FORBIDDEN_INPUT_KEYS = [
  "auth",
  "budget",
  "contacts",
  "cookie",
  "cookies",
  "email",
  "interviews",
  "notes",
  "objections",
  "outreach",
  "password",
  "phone",
  "private_notes",
  "raw_notes",
  "rationale",
  "service_role",
  "session",
  "student",
  "token",
  "api_key"
] as const;

export function findOutreachDraftForbiddenInputKeys(
  value: unknown,
  path = ""
): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findOutreachDraftForbiddenInputKeys(item, `${path}[${index}]`)
    );
  }

  const forbidden: string[] = [];

  for (const [key, nestedValue] of Object.entries(value)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (
      OUTREACH_DRAFT_FORBIDDEN_INPUT_KEYS.includes(
        key as (typeof OUTREACH_DRAFT_FORBIDDEN_INPUT_KEYS)[number]
      )
    ) {
      forbidden.push(currentPath);
    }

    forbidden.push(...findOutreachDraftForbiddenInputKeys(nestedValue, currentPath));
  }

  return forbidden;
}

function scrubUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubPiiFromString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubUnknown(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        scrubUnknown(nestedValue)
      ])
    );
  }

  return value;
}

export function sanitizeProspectOutreachDraftInput(
  input: ProspectOutreachDraftInput
): ProspectOutreachDraftInput {
  return prospectOutreachDraftInputSchema.parse(scrubUnknown(input));
}

export function validateProspectOutreachDraftInput(
  input: unknown
):
  | { ok: true; input: ProspectOutreachDraftInput }
  | { ok: false; error: string } {
  const parsed = prospectOutreachDraftInputSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: "Prospect outreach draft input is invalid." };
  }

  return { ok: true, input: parsed.data };
}

export function validateProspectOutreachDraftOutput(
  output: unknown
):
  | { ok: true; data: ProspectOutreachDraftOutput }
  | { ok: false; error: string } {
  const parsed = prospectOutreachDraftOutputSchema.safeParse(output);

  if (!parsed.success) {
    return {
      ok: false,
      error: "Prospect outreach draft output did not match the schema."
    };
  }

  return { ok: true, data: parsed.data };
}

export function getProspectOutreachDraftDisabledReason(
  env: NodeJS.ProcessEnv = process.env
): string {
  return getLlmEnrichmentDisabledReason(env);
}

export function isProspectOutreachDraftEnabledInEnv(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isLlmEnrichmentEnabledInEnv(env);
}

export {
  containsUnresolvedPiiInValue,
  getOpenAiApiKeyFromEnv
};

export const PROSPECT_OUTREACH_DRAFT_REVIEW_WARNING =
  "AI-generated outreach drafts must be reviewed and edited by a human before sending. Do not email prospects directly from this tool.";
