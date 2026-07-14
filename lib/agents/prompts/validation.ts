import {
  resolveAgentPromptConfig,
  type AgentPromptConfig
} from "./config";
import {
  extractPlaceholders,
  findUnknownPlaceholders,
  PROMPT_ALLOWED_PLACEHOLDER_SET
} from "./placeholders";
import type {
  PromptActivationGateResult,
  AgentPromptVersion
} from "./types";

const FORBIDDEN_PROMPT_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "student_pii", re: /\b(ssn|social\s*security|student\s+id|ferpa)\b/i },
  {
    label: "protected_education_records",
    re: /\b(education\s+record|grades?\s+transcript|gpa\b|disciplinary\s+record)\b/i
  },
  {
    label: "auth_tokens",
    re: /\b(auth[_-]?token|bearer\s+[A-Za-z0-9._-]{16,}|refresh[_-]?token)\b/i
  },
  { label: "cookies", re: /\b(cookie\s*[:=]|set-cookie|session[_-]?cookie)\b/i },
  {
    label: "api_keys",
    re: /\b(api[_-]?key|sk-[A-Za-z0-9]{10,}|OPENAI_API_KEY)\b/i
  },
  {
    label: "raw_private_notes",
    re: /\b(private\s+notes?|internal\s+notes?\s+dump|confidential\s+crm\s+notes)\b/i
  },
  {
    label: "hidden_system_prompts",
    re: /\b(ignore\s+previous\s+instructions|hidden\s+system\s+prompt)\b/i
  },
  {
    label: "autonomous_external_sending",
    re: /\b(auto[_-]?send\s+(email|message)|send\s+without\s+approval)\b/i
  },
  {
    label: "autonomous_prospect_approval",
    re: /\b(auto[_-]?approve\s+prospect|approve\s+candidates?\s+automatically)\b/i
  },
  {
    label: "autonomous_proposal_sending",
    re: /\b(auto[_-]?send\s+proposal|send\s+proposal\s+without\s+approval)\b/i
  }
];

const SUPPORTED_PROVIDERS = new Set(["openai", "none"]);
const SUPPORTED_MODELS = new Set([
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "none"
]);

export function findForbiddenPromptContent(
  systemPrompt: string,
  userPromptTemplate: string
): string[] {
  const combined = `${systemPrompt}\n${userPromptTemplate}`;
  const hits: string[] = [];
  for (const rule of FORBIDDEN_PROMPT_PATTERNS) {
    if (rule.re.test(combined)) {
      hits.push(rule.label);
    }
  }
  return hits;
}

export function validatePromptDraftContent(params: {
  systemPrompt: string;
  userPromptTemplate: string;
  config?: AgentPromptConfig;
}): { ok: true } | { ok: false; errors: string[] } {
  const config = params.config ?? resolveAgentPromptConfig();
  const errors: string[] = [];

  if (!params.systemPrompt.trim()) {
    errors.push("system_prompt is required.");
  }
  if (!params.userPromptTemplate.trim()) {
    errors.push("user_prompt_template is required.");
  }

  const totalChars =
    params.systemPrompt.length + params.userPromptTemplate.length;
  if (totalChars > config.maxTemplateChars) {
    errors.push(
      `Prompt templates exceed max length of ${config.maxTemplateChars} characters.`
    );
  }

  const unknown = [
    ...findUnknownPlaceholders(params.systemPrompt),
    ...findUnknownPlaceholders(params.userPromptTemplate)
  ];
  if (unknown.length > 0) {
    errors.push(
      `Unknown placeholders: ${[...new Set(unknown)].join(", ")}.`
    );
  }

  const forbidden = findForbiddenPromptContent(
    params.systemPrompt,
    params.userPromptTemplate
  );
  if (forbidden.length > 0) {
    errors.push(`Forbidden prompt content: ${forbidden.join(", ")}.`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function assertRequiredPlaceholdersPresent(params: {
  template: string;
  required: string[];
}): { ok: true } | { ok: false; missing: string[] } {
  const present = new Set(extractPlaceholders(params.template));
  const missing = params.required.filter((name) => {
    if (!PROMPT_ALLOWED_PLACEHOLDER_SET.has(name)) {
      return false;
    }
    return !present.has(name);
  });
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

export type ActivationGateInput = {
  version: Pick<
    AgentPromptVersion,
    | "system_prompt"
    | "user_prompt_template"
    | "output_schema_version"
    | "safety_policy_version"
    | "provider"
    | "model"
    | "max_output_tokens"
    | "status"
  >;
  schemaExists: boolean;
  testsPassed: boolean;
  /** Mean quality score when evaluation data exists; null if none. */
  averageQualityScore: number | null;
  config?: AgentPromptConfig;
};

export function evaluatePromptActivationGates(
  input: ActivationGateInput
): PromptActivationGateResult {
  const config = input.config ?? resolveAgentPromptConfig();
  const errors: string[] = [];

  if (input.version.status === "archived") {
    errors.push("Archived versions cannot be activated.");
  }

  const content = validatePromptDraftContent({
    systemPrompt: input.version.system_prompt,
    userPromptTemplate: input.version.user_prompt_template,
    config
  });
  if (!content.ok) {
    errors.push(...content.errors);
  }

  if (config.requireSchemaVersion && !input.version.output_schema_version.trim()) {
    errors.push("output_schema_version is required.");
  }
  if (!input.schemaExists) {
    errors.push("Referenced output schema version is not registered.");
  }

  if (config.requireSafetyPolicy && !input.version.safety_policy_version.trim()) {
    errors.push("safety_policy_version is required.");
  }

  if (!input.testsPassed) {
    errors.push("Prompt validation tests must pass before activation.");
  }

  if (
    !SUPPORTED_PROVIDERS.has(String(input.version.provider).toLowerCase())
  ) {
    errors.push(`Unsupported provider: ${input.version.provider}.`);
  }

  if (!SUPPORTED_MODELS.has(String(input.version.model))) {
    errors.push(`Unsupported model: ${input.version.model}.`);
  }

  if (
    !Number.isFinite(input.version.max_output_tokens) ||
    input.version.max_output_tokens <= 0 ||
    input.version.max_output_tokens > config.maxOutputTokens
  ) {
    errors.push(
      `max_output_tokens must be between 1 and ${config.maxOutputTokens}.`
    );
  }

  if (
    input.averageQualityScore != null &&
    input.averageQualityScore < config.activationMinQuality
  ) {
    errors.push(
      `Quality threshold not met (${input.averageQualityScore} < ${config.activationMinQuality}). LLM self-evaluation alone is not sufficient.`
    );
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function canMutatePromptVersionContent(
  status: AgentPromptVersion["status"]
): boolean {
  return status === "draft";
}
