import { z } from "zod";

export const PROSPECT_ENRICHMENT_PROMPT_VERSION = "prospect.enrich.v1";

export const LLM_ENRICHMENT_ENV = {
  enabled: "LLM_ENRICHMENT_ENABLED",
  apiKey: "OPENAI_API_KEY"
} as const;

export const publicInstitutionSnapshotSchema = z.object({
  name: z.string().trim().min(1).max(200),
  city: z.string().trim().max(120).nullable(),
  state: z.string().trim().max(32).nullable(),
  website_domain: z.string().trim().max(253).nullable(),
  categories: z.array(z.string().trim().min(1).max(120)).max(12),
  enrollment_band: z.string().trim().max(40).nullable(),
  program_highlights: z.array(z.string().trim().min(1).max(200)).max(10)
});

export const prospectEnrichmentIcpSchema = z.object({
  geography: z.string().trim().min(1).max(200),
  school_types: z.array(z.string().trim().min(1).max(80)).min(1).max(5),
  keywords: z.string().trim().max(500)
});

export const prospectEnrichmentSourceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(500)
});

export const prospectEnrichmentInputSchema = z.object({
  institution: publicInstitutionSnapshotSchema,
  icp: prospectEnrichmentIcpSchema,
  sources: z.array(prospectEnrichmentSourceSchema).min(1).max(5)
});

export const prospectEnrichmentOutputSchema = z.object({
  public_summary: z.string().trim().min(20).max(800),
  fit_rationale: z.string().trim().min(20).max(1000),
  outreach_angle: z.string().trim().min(20).max(600),
  suggested_next_step: z.string().trim().min(5).max(120),
  enrichment_confidence: z.number().min(0).max(1),
  evidence_used: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
  warnings: z.array(z.string().trim().min(1).max(200)).max(10).optional()
});

export type PublicInstitutionSnapshot = z.infer<typeof publicInstitutionSnapshotSchema>;
export type ProspectEnrichmentIcp = z.infer<typeof prospectEnrichmentIcpSchema>;
export type ProspectEnrichmentSource = z.infer<typeof prospectEnrichmentSourceSchema>;
export type ProspectEnrichmentInput = z.infer<typeof prospectEnrichmentInputSchema>;
export type ProspectEnrichmentOutput = z.infer<typeof prospectEnrichmentOutputSchema>;

export type ProspectEnrichmentContext = {
  organization_id: string;
  job_id: string;
  candidate_id: string;
};

export type ProspectEnrichmentRequest = {
  input: ProspectEnrichmentInput;
  context: ProspectEnrichmentContext;
};

export type LlmEnrichmentDisabledResult = {
  ok: false;
  status: "disabled";
  reason: string;
};

export type LlmEnrichmentBlockedResult = {
  ok: false;
  status: "blocked";
  reason: string;
  block_reason: "pii_detected" | "forbidden_field" | "invalid_input";
};

export type LlmEnrichmentValidationFailedResult = {
  ok: false;
  status: "validation_failed";
  reason: string;
};

export type LlmEnrichmentProviderErrorResult = {
  ok: false;
  status: "provider_error";
  reason: string;
};

export type LlmEnrichmentSuccessResult = {
  ok: true;
  status: "enriched";
  data: ProspectEnrichmentOutput;
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

export type LlmEnrichmentResult =
  | LlmEnrichmentSuccessResult
  | LlmEnrichmentDisabledResult
  | LlmEnrichmentBlockedResult
  | LlmEnrichmentValidationFailedResult
  | LlmEnrichmentProviderErrorResult;

export type LlmEnrichmentProvider = {
  name: "openai";
  enrich: (
    input: ProspectEnrichmentInput
  ) => Promise<
    | Pick<LlmEnrichmentSuccessResult, "ok" | "status" | "data" | "provider" | "model" | "usage">
    | LlmEnrichmentProviderErrorResult
    | LlmEnrichmentValidationFailedResult
  >;
};

export function isTruthyEnvFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function getOpenAiApiKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const apiKey = env[LLM_ENRICHMENT_ENV.apiKey]?.trim();
  return apiKey || null;
}

export function isLlmEnrichmentEnabledInEnv(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    isTruthyEnvFlag(env[LLM_ENRICHMENT_ENV.enabled]) &&
    Boolean(getOpenAiApiKeyFromEnv(env))
  );
}

export function getLlmEnrichmentDisabledReason(
  env: NodeJS.ProcessEnv = process.env
): string {
  if (!isTruthyEnvFlag(env[LLM_ENRICHMENT_ENV.enabled])) {
    return "LLM enrichment is disabled. Set LLM_ENRICHMENT_ENABLED=true to enable.";
  }

  if (!getOpenAiApiKeyFromEnv(env)) {
    return "LLM enrichment is disabled. OPENAI_API_KEY is not configured.";
  }

  return "LLM enrichment is disabled.";
}

export const FORBIDDEN_INPUT_KEYS = [
  "auth",
  "contacts",
  "cookie",
  "cookies",
  "email",
  "interviews",
  "notes",
  "outreach",
  "password",
  "phone",
  "private_notes",
  "raw_notes",
  "service_role",
  "session",
  "student",
  "token",
  "api_key"
] as const;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}\b/;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;

export function scrubPiiFromString(value: string): string {
  return value
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(PHONE_PATTERN, "[REDACTED_PHONE]")
    .replace(SSN_PATTERN, "[REDACTED_SSN]");
}

export function containsUnresolvedPii(value: string): boolean {
  return (
    EMAIL_PATTERN.test(value) ||
    PHONE_PATTERN.test(value) ||
    SSN_PATTERN.test(value)
  );
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

export function findForbiddenInputKeys(value: unknown, path = ""): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findForbiddenInputKeys(item, `${path}[${index}]`)
    );
  }

  const forbidden: string[] = [];

  for (const [key, nestedValue] of Object.entries(value)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (FORBIDDEN_INPUT_KEYS.includes(key as (typeof FORBIDDEN_INPUT_KEYS)[number])) {
      forbidden.push(currentPath);
    }

    forbidden.push(...findForbiddenInputKeys(nestedValue, currentPath));
  }

  return forbidden;
}

export function containsUnresolvedPiiInValue(value: unknown): boolean {
  if (typeof value === "string") {
    return containsUnresolvedPii(value);
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsUnresolvedPiiInValue(item));
  }

  if (value && typeof value === "object") {
    return Object.values(value).some((item) => containsUnresolvedPiiInValue(item));
  }

  return false;
}

export function sanitizeProspectEnrichmentInput(
  input: ProspectEnrichmentInput
): ProspectEnrichmentInput {
  return prospectEnrichmentInputSchema.parse(scrubUnknown(input));
}

export function validateProspectEnrichmentInput(
  input: unknown
):
  | { ok: true; input: ProspectEnrichmentInput }
  | { ok: false; error: string } {
  const parsed = prospectEnrichmentInputSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: "Prospect enrichment input is invalid." };
  }

  return { ok: true, input: parsed.data };
}

export function validateProspectEnrichmentOutput(
  output: unknown
):
  | { ok: true; data: ProspectEnrichmentOutput }
  | { ok: false; error: string } {
  const parsed = prospectEnrichmentOutputSchema.safeParse(output);

  if (!parsed.success) {
    return { ok: false, error: "Prospect enrichment output did not match the schema." };
  }

  return { ok: true, data: parsed.data };
}

export function extractWebsiteDomain(website: string | null | undefined): string | null {
  if (!website?.trim()) {
    return null;
  }

  try {
    const normalized = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    return new URL(normalized).hostname.replace(/^www\./i, "") || null;
  } catch {
    return null;
  }
}
